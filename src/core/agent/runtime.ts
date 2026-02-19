import { randomUUID } from "node:crypto";
import { callModel } from "../model/request.js";
import type {
  ContentBlock,
  MessageParam,
  ServerToolUseBlock,
  ToolUseBlock,
  ToolResultBlock,
} from "../model/types.js";
import type { PermissionDecision } from "../permissions/types.js";
import type {
  AgentPermissionDenial,
  AgentRuntimeConfig,
  AgentRuntimeEvent,
  AgentSubmitOptions,
} from "./types.js";

function defaultUuid() {
  if (typeof randomUUID === "function") return randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowMs() {
  return Date.now();
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (!Array.isArray(content)) {
    if (typeof content === "string") return [{ type: "text", text: content }];
    return [];
  }
  return content as ContentBlock[];
}

function extractText(content: unknown): string {
  const blocks = normalizeContent(content);
  const text = blocks
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
  return text.trim();
}

function toToolSchema(tool: { name: string; description: string; inputSchema: Record<string, unknown> }) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

export class AgentRuntime {
  private readonly cfg: AgentRuntimeConfig;
  private readonly clock: () => number;
  private readonly mkUuid: () => string;
  private readonly sessionId: string;
  private readonly abortController = new AbortController();
  private readonly permissionDenials: AgentPermissionDenial[] = [];
  private readonly modelUsage: Record<string, { input_tokens: number; output_tokens: number }> = {};
  private readonly totalUsage: { input_tokens: number; output_tokens: number } = {
    input_tokens: 0,
    output_tokens: 0,
  };
  private readonly mutableMessages: MessageParam[] = [];
  private emittedInit = false;
  private userSpecifiedModel: string;

  constructor(config: AgentRuntimeConfig) {
    this.cfg = config;
    this.clock = config.now ?? nowMs;
    this.mkUuid = config.createUuid ?? defaultUuid;
    this.sessionId = config.sessionId ?? this.mkUuid();
    this.userSpecifiedModel = config.model;
    if (config.messages?.length) this.mutableMessages.push(...structuredClone(config.messages));
  }

  async *submitMessage(input: string, options: AgentSubmitOptions = {}): AsyncGenerator<AgentRuntimeEvent> {
    const startedAt = this.clock();
    let apiDurationMs = 0;
    let turnCount = 0;
    const requestUuid = options.uuid ?? this.mkUuid();
    const maxTurns = this.cfg.maxTurns ?? 16;
    const maxTokens = this.cfg.maxTokens ?? 1024;

    try {
      if (!this.emittedInit) {
        this.emittedInit = true;
        yield {
          type: "system",
          subtype: "init",
          cwd: this.cfg.cwd,
          session_id: this.sessionId,
          tools: this.cfg.tools.map((tool) => tool.name),
          mcp_servers: (this.cfg.mcpServers ?? []).map((server) => ({
            name: server.name,
            status: server.type,
          })),
          model: this.userSpecifiedModel,
          slash_commands: (this.cfg.slashCommands ?? []).map((command) => command.name),
          agents: this.cfg.identity?.agentType ? [this.cfg.identity.agentType] : [],
          uuid: this.mkUuid(),
        };
      }

      const userMessage: MessageParam = { role: "user", content: input };
      this.mutableMessages.push(userMessage);
      yield {
        type: "user",
        message: userMessage,
        session_id: this.sessionId,
        parent_tool_use_id: null,
        uuid: requestUuid,
      };

      for (let turn = 0; turn < maxTurns; turn += 1) {
        turnCount += 1;
        const apiStart = this.clock();
        const response = await callModel(this.cfg.client as any, {
          model: this.userSpecifiedModel,
          messages: this.mutableMessages,
          max_tokens: maxTokens,
          tools: this.cfg.tools.map(toToolSchema),
          system: this.buildSystemPromptBlocks(),
          signal: this.abortController.signal,
          hasAppendSystemPrompt: Boolean(this.cfg.appendSystemPrompt),
          isNonInteractive: true,
          skills: this.cfg.skills,
        });
        apiDurationMs += this.clock() - apiStart;
        this.updateUsage(response?.usage);

        const assistantMessage: MessageParam = {
          role: "assistant",
          content: response?.content ?? [],
        };
        this.mutableMessages.push(assistantMessage);
        yield {
          type: "assistant",
          message: assistantMessage,
          session_id: this.sessionId,
          parent_tool_use_id: null,
          uuid: this.mkUuid(),
        };

        const contentBlocks = normalizeContent(assistantMessage.content);
        const localToolUses = contentBlocks.filter(
          (block): block is ToolUseBlock => block.type === "tool_use"
        );
        const serverToolUses = contentBlocks.filter(
          (block): block is ServerToolUseBlock => block.type === "server_tool_use"
        );

        if (localToolUses.length === 0 && serverToolUses.length === 0) {
          const result = extractText(assistantMessage.content);
          yield this.successResult(startedAt, apiDurationMs, turnCount, result);
          return;
        }

        const toolResultBlocks: ToolResultBlock[] = [];
        for (const toolUse of localToolUses) {
          toolResultBlocks.push(await this.runLocalTool(toolUse));
        }
        for (const toolUse of serverToolUses) {
          toolResultBlocks.push(await this.runServerTool(toolUse));
        }

        if (toolResultBlocks.length > 0) {
          const toolResultMessage: MessageParam = { role: "user", content: toolResultBlocks };
          this.mutableMessages.push(toolResultMessage);
          yield {
            type: "user",
            message: toolResultMessage,
            session_id: this.sessionId,
            parent_tool_use_id: null,
            uuid: this.mkUuid(),
          };
          yield {
            type: "tool_use_summary",
            summary: this.formatToolSummary(toolResultBlocks),
            preceding_tool_use_ids: toolResultBlocks.map((block) => block.tool_use_id),
            session_id: this.sessionId,
            uuid: this.mkUuid(),
          };
        }

        if (
          typeof this.cfg.maxBudgetUsd === "number" &&
          this.cfg.maxBudgetUsd >= 0 &&
          this.estimateCostUsd() > this.cfg.maxBudgetUsd
        ) {
          yield {
            type: "result",
            subtype: "error_max_budget_usd",
            is_error: false,
            duration_ms: this.clock() - startedAt,
            duration_api_ms: apiDurationMs,
            num_turns: turnCount,
            session_id: this.sessionId,
            total_cost_usd: this.estimateCostUsd(),
            usage: { ...this.totalUsage },
            modelUsage: this.modelUsage,
            permission_denials: this.permissionDenials,
            uuid: this.mkUuid(),
            errors: [],
          };
          return;
        }
      }

      yield {
        type: "result",
        subtype: "error_max_turns",
        is_error: false,
        duration_ms: this.clock() - startedAt,
        duration_api_ms: apiDurationMs,
        num_turns: turnCount,
        session_id: this.sessionId,
        total_cost_usd: this.estimateCostUsd(),
        usage: { ...this.totalUsage },
        modelUsage: this.modelUsage,
        permission_denials: this.permissionDenials,
        uuid: this.mkUuid(),
        errors: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        duration_ms: this.clock() - startedAt,
        duration_api_ms: apiDurationMs,
        num_turns: turnCount,
        session_id: this.sessionId,
        total_cost_usd: this.estimateCostUsd(),
        usage: { ...this.totalUsage },
        modelUsage: this.modelUsage,
        permission_denials: this.permissionDenials,
        uuid: this.mkUuid(),
        errors: [message],
      };
    }
  }

  interrupt() {
    this.abortController.abort();
  }

  getMessages() {
    return this.mutableMessages;
  }

  getSessionId() {
    return this.sessionId;
  }

  setModel(model: string) {
    this.userSpecifiedModel = model;
  }

  private buildSystemPromptBlocks() {
    const prompts: string[] = [];
    if (this.cfg.customSystemPrompt) prompts.push(this.cfg.customSystemPrompt);
    if (this.cfg.appendSystemPrompt) prompts.push(this.cfg.appendSystemPrompt);
    return prompts;
  }

  private async runLocalTool(toolUse: ToolUseBlock): Promise<ToolResultBlock> {
    const tool = this.cfg.tools.find((candidate) => candidate.name === toolUse.name);
    if (!tool) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: Tool '${toolUse.name}' not found`,
        is_error: true,
      };
    }

    try {
      let input: unknown = toolUse.input;
      const decision = await this.maybeCanUseTool(tool, input, toolUse.id);
      if (decision.behavior === "deny") {
        this.permissionDenials.push({
          tool_name: tool.name,
          tool_use_id: toolUse.id,
          tool_input: input,
        });
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: decision.message ?? "Permission denied",
          is_error: true,
        };
      }

      if (decision.updatedInput !== undefined) input = decision.updatedInput;
      if (tool.parse) input = tool.parse(input);
      const output = await tool.run(input as never);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output,
      };
    } catch (error) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true,
      };
    }
  }

  private async runServerTool(toolUse: ServerToolUseBlock): Promise<ToolResultBlock> {
    if (!this.cfg.runServerTool) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: MCP tool '${toolUse.name}' is unavailable`,
        is_error: true,
      };
    }

    try {
      const output = await this.cfg.runServerTool(
        { id: toolUse.id, name: toolUse.name, input: toolUse.input },
        { signal: this.abortController.signal }
      );
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output,
      };
    } catch (error) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true,
      };
    }
  }

  private async maybeCanUseTool(tool: { name: string }, input: unknown, toolUseId: string): Promise<PermissionDecision> {
    if (!this.cfg.canUseTool) return { behavior: "allow" };
    const decision = await this.cfg.canUseTool(
      tool as never,
      input,
      { toolUseId, signal: this.abortController.signal }
    );
    return decision ?? { behavior: "allow" };
  }

  private formatToolSummary(blocks: ToolResultBlock[]) {
    const parts = blocks.map((block) => {
      const status = block.is_error ? "error" : "ok";
      return `${block.tool_use_id}:${status}`;
    });
    return parts.join(", ");
  }

  private successResult(
    startedAt: number,
    apiDurationMs: number,
    turnCount: number,
    text: string
  ): AgentRuntimeEvent {
    return {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: this.clock() - startedAt,
      duration_api_ms: apiDurationMs,
      num_turns: turnCount,
      result: text,
      session_id: this.sessionId,
      total_cost_usd: this.estimateCostUsd(),
      usage: { ...this.totalUsage },
      modelUsage: this.modelUsage,
      permission_denials: this.permissionDenials,
      uuid: this.mkUuid(),
    };
  }

  private updateUsage(usage: unknown) {
    if (!usage || typeof usage !== "object") return;
    const inputTokens = Number((usage as any).input_tokens ?? 0);
    const outputTokens = Number((usage as any).output_tokens ?? 0);
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return;

    this.totalUsage.input_tokens += inputTokens;
    this.totalUsage.output_tokens += outputTokens;

    const bucket = this.modelUsage[this.userSpecifiedModel] ?? {
      input_tokens: 0,
      output_tokens: 0,
    };
    bucket.input_tokens += inputTokens;
    bucket.output_tokens += outputTokens;
    this.modelUsage[this.userSpecifiedModel] = bucket;
  }

  private estimateCostUsd() {
    // Cost table is provider- and date-dependent. Keep deterministic placeholder for now.
    return 0;
  }
}

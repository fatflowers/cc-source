import type { McpServerConfig } from "../mcp/types.js";
import type { MessageParam, SkillPromptOptions } from "../model/types.js";
import type { PermissionDecision } from "../permissions/types.js";
import type { ToolDefinition } from "../tools/types.js";

export type TeammateMode = "auto" | "tmux" | "in-process";

export interface AgentIdentity {
  agentId?: string;
  parentSessionId?: string;
  agentName?: string;
  teamName?: string;
  agentColor?: string;
  planModeRequired?: boolean;
  isTeamLead?: boolean;
  agentType?: string;
}

export interface AgentPermissionDenial {
  tool_name: string;
  tool_use_id: string;
  tool_input: unknown;
}

export interface AgentSlashCommand {
  name: string;
}

export interface AgentRuntimeConfig {
  client: {
    beta: {
      messages: {
        create: (params: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<any>;
      };
    };
  };
  cwd: string;
  model: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  maxTurns?: number;
  maxBudgetUsd?: number;
  customSystemPrompt?: string;
  appendSystemPrompt?: string;
  skills?: SkillPromptOptions;
  messages?: MessageParam[];
  mcpServers?: McpServerConfig[];
  slashCommands?: AgentSlashCommand[];
  includePartialMessages?: boolean;
  replayUserMessages?: boolean;
  identity?: AgentIdentity;
  sessionId?: string;
  now?: () => number;
  createUuid?: () => string;
  canUseTool?: (
    tool: ToolDefinition,
    input: unknown,
    meta: { toolUseId: string; signal: AbortSignal }
  ) => Promise<PermissionDecision> | PermissionDecision;
  runServerTool?: (
    input: { id: string; name: string; input: unknown },
    meta: { signal: AbortSignal }
  ) => Promise<unknown> | unknown;
}

export interface AgentSubmitOptions {
  uuid?: string;
}

export type AgentRuntimeResultSubtype =
  | "success"
  | "error_during_execution"
  | "error_max_turns"
  | "error_max_budget_usd"
  | "error_max_structured_output_retries";

export interface AgentInitEvent {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: Array<{ name: string; status: string }>;
  model: string;
  slash_commands: string[];
  agents: string[];
  uuid: string;
}

export interface AgentUserEvent {
  type: "user";
  message: MessageParam;
  session_id: string;
  parent_tool_use_id: string | null;
  uuid: string;
  isReplay?: boolean;
}

export interface AgentAssistantEvent {
  type: "assistant";
  message: MessageParam;
  session_id: string;
  parent_tool_use_id: string | null;
  uuid: string;
}

export interface AgentProgressEvent {
  type: "progress";
  message: unknown;
  session_id: string;
  parent_tool_use_id: string | null;
  uuid: string;
}

export interface AgentStreamEvent {
  type: "stream_event";
  event: unknown;
  session_id: string;
  parent_tool_use_id: string | null;
  uuid: string;
}

export interface AgentToolUseSummaryEvent {
  type: "tool_use_summary";
  summary: string;
  preceding_tool_use_ids: string[];
  session_id: string;
  uuid: string;
}

export interface AgentSystemEvent {
  type: "system";
  subtype: string;
  session_id: string;
  uuid: string;
  [key: string]: unknown;
}

export interface AgentResultEvent {
  type: "result";
  subtype: AgentRuntimeResultSubtype;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  session_id: string;
  total_cost_usd: number;
  usage: Record<string, unknown>;
  modelUsage: Record<string, unknown>;
  permission_denials: AgentPermissionDenial[];
  uuid: string;
  result?: string;
  structured_output?: unknown;
  errors?: string[];
}

export type AgentRuntimeEvent =
  | AgentInitEvent
  | AgentUserEvent
  | AgentAssistantEvent
  | AgentProgressEvent
  | AgentStreamEvent
  | AgentToolUseSummaryEvent
  | AgentSystemEvent
  | AgentResultEvent;

export type MailboxMessageKind =
  | "user"
  | "shutdown_request"
  | "shutdown_approved"
  | "task_notification";

export interface TeamMailboxMessage {
  id: string;
  kind: MailboxMessageKind;
  text: string;
  from?: string;
  to: string;
  color?: string;
  createdAt: number;
  readAt?: number;
  metadata?: Record<string, unknown>;
}

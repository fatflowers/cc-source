import type { AnthropicClient, MessageParam } from "./types.js";

export interface ToolDefinition {
  name: string;
  run?: (input: unknown) => Promise<unknown> | unknown;
  parse?: (input: unknown) => unknown;
}

export interface ToolRunnerParams {
  messages: MessageParam[];
  tools: ToolDefinition[];
  max_iterations?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export async function buildToolResultsMessage(
  params: { tools: ToolDefinition[] },
  message: MessageParam | undefined | null
): Promise<MessageParam | null> {
  if (!message || message.role !== "assistant") return null;
  if (!message.content || typeof message.content === "string") return null;

  const toolUses = message.content.filter((block) => block.type === "tool_use");
  if (toolUses.length === 0) return null;

  const results = await Promise.all(
    toolUses.map(async (toolUse) => {
      if (toolUse.type !== "tool_use") return null;
      const tool = params.tools.find((candidate) => candidate.name === toolUse.name);
      if (!tool || !tool.run) {
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: Tool '${toolUse.name}' not found`,
          is_error: true,
        };
      }

      try {
        let input: unknown = toolUse.input;
        if (tool.parse) {
          input = tool.parse(input);
        }
        const output = await tool.run(input);
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
    })
  );

  return {
    role: "user",
    content: results.filter(Boolean) as any,
  };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

export class ToolRunner implements AsyncIterable<any> {
  private client: AnthropicClient;
  private paramsWrapper: { params: ToolRunnerParams };
  private requestOptions: Record<string, unknown>;
  private consumed = false;
  private paramsDirty = false;
  private pendingResponse: Promise<any> | undefined;
  private toolResponseCache: Promise<MessageParam | null> | undefined;
  private donePromise = deferred<any>();
  private iteration = 0;

  constructor(client: AnthropicClient, params: ToolRunnerParams, options: Record<string, unknown> = {}) {
    this.client = client;
    this.paramsWrapper = { params: { ...params, messages: structuredClone(params.messages) } };
    this.requestOptions = {
      ...options,
      headers: {
        "x-stainless-helper": "BetaToolRunner",
        ...(options as { headers?: Record<string, string> }).headers,
      },
    };
  }

  async *[Symbol.asyncIterator]() {
    if (this.consumed) {
      throw new Error("Cannot iterate over a consumed stream");
    }
    this.consumed = true;
    this.paramsDirty = true;
    this.toolResponseCache = undefined;

    try {
      while (true) {
        if (
          this.paramsWrapper.params.max_iterations !== undefined &&
          this.iteration >= this.paramsWrapper.params.max_iterations
        ) {
          break;
        }

        this.paramsDirty = false;
        this.toolResponseCache = undefined;
        this.iteration += 1;

        const { max_iterations, ...requestParams } = this.paramsWrapper.params;

        let response: any;
        if (requestParams.stream) {
          const stream = this.client.beta.messages.stream(
            { ...requestParams },
            this.requestOptions as { signal?: AbortSignal; headers?: Record<string, string> }
          );
          this.pendingResponse = stream.finalMessage?.() ?? Promise.resolve(undefined);
          yield stream;
          response = await this.pendingResponse;
        } else {
          this.pendingResponse = this.client.beta.messages.create(
            { ...requestParams, stream: false },
            this.requestOptions as { signal?: AbortSignal }
          );
          response = await this.pendingResponse;
          yield response;
        }

        if (!this.paramsDirty && response) {
          this.paramsWrapper.params.messages.push({
            role: response.role ?? "assistant",
            content: response.content,
          });
        }

        const toolResponse = await this.generateToolResponse();
        if (toolResponse) {
          this.paramsWrapper.params.messages.push(toolResponse);
        }

        if (!toolResponse && !this.paramsDirty) {
          break;
        }
      }

      if (!this.pendingResponse) {
        throw new Error("ToolRunner concluded without a message from the server");
      }

      this.donePromise.resolve(await this.pendingResponse);
    } catch (error) {
      this.consumed = false;
      this.donePromise.promise.catch(() => undefined);
      this.donePromise.reject(error);
      this.donePromise = deferred<any>();
      throw error;
    }
  }

  setMessagesParams(update: ToolRunnerParams | ((params: ToolRunnerParams) => ToolRunnerParams)) {
    if (typeof update === "function") {
      this.paramsWrapper.params = update(this.paramsWrapper.params);
    } else {
      this.paramsWrapper.params = update;
    }
    this.paramsDirty = true;
    this.toolResponseCache = undefined;
  }

  async generateToolResponse(): Promise<MessageParam | null> {
    if (this.toolResponseCache !== undefined) {
      return this.toolResponseCache;
    }

    const lastMessage = this.paramsWrapper.params.messages.at(-1);
    this.toolResponseCache = buildToolResultsMessage(
      { tools: this.paramsWrapper.params.tools },
      lastMessage
    );
    return this.toolResponseCache;
  }

  done() {
    return this.donePromise.promise;
  }

  async runUntilDone() {
    if (!this.consumed) {
      for await (const _ of this) {
        void _;
      }
    }
    return this.done();
  }

  get params() {
    return this.paramsWrapper.params;
  }

  pushMessages(...messages: MessageParam[]) {
    this.setMessagesParams((current) => ({
      ...current,
      messages: [...current.messages, ...messages],
    }));
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.runUntilDone().then(onfulfilled, onrejected);
  }
}

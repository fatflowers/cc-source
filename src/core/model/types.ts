export type Role = "user" | "assistant" | "system";

export type TextBlock = {
  type: "text";
  text: string;
  citations?: unknown[];
  cache_control?: unknown;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
  signature?: string;
};

export type RedactedThinkingBlock = {
  type: "redacted_thinking";
  data?: string;
};

export type ImageBlock = {
  type: "image";
  source?: unknown;
};

export type ServerToolUseBlock = {
  type: "server_tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ImageBlock
  | ServerToolUseBlock;

export type MessageContent = string | ContentBlock[];

export interface MessageParam {
  role: Role;
  content: MessageContent;
}

export type SystemBlock = TextBlock;

export interface ToolChoice {
  type: "tool" | "auto" | "none";
  name?: string;
}

export interface OutputFormat {
  format: unknown;
}

export interface OutputConfig {
  format?: unknown;
  [key: string]: unknown;
}

export interface ModelMetadata {
  [key: string]: string;
}

export interface ModelRequestParams {
  model: string;
  system?: string | string[] | SystemBlock[];
  messages: MessageParam[];
  tools?: unknown[];
  tool_choice?: ToolChoice;
  output_format?: unknown;
  max_tokens?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  betas?: string[];
  metadata?: ModelMetadata;
  isNonInteractive?: boolean;
  hasAppendSystemPrompt?: boolean;
  provider?: "vertex" | "bedrock" | "default" | string;
}

export interface AnthropicMessagesClient {
  create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<any>;
  stream(
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal; headers?: Record<string, string> }
  ): any;
}

export interface AnthropicClient {
  beta: {
    messages: AnthropicMessagesClient;
  };
}

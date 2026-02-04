export type McpConnectionStatus = "connected" | "disconnected" | "error";

export interface McpResourceDescriptor {
  uri: string;
  name?: string;
  description?: string;
}

export interface McpServerConfig {
  name: string;
  type: "connected" | "disconnected" | "unknown";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  resources?: McpResourceDescriptor[];
}

export interface McpResourceContent {
  uri: string;
  content: string;
  mimeType?: string;
}

export interface McpToolCallInput {
  name: string;
  input: Record<string, unknown>;
}

export interface McpToolResult {
  content: unknown;
  is_error?: boolean;
}

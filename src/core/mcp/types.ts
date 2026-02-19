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

export interface McpLogger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  silly?: (...args: unknown[]) => void;
}

export interface McpBridgeConfig {
  url: string;
  devUserId?: string;
  getUserId?: () => Promise<string | null>;
  getOAuthToken?: () => Promise<string | null>;
}

export interface McpClientContext {
  serverName: string;
  logger: McpLogger;
  clientTypeId: string;
  socketPath?: string;
  getSocketPath?: () => string | undefined;
  getSocketPaths?: () => Array<string | { serverName: string; socketPath: string }>;
  bridgeConfig?: McpBridgeConfig;
  initialPermissionMode?: string;
  onAuthenticationError?: () => void;
  isDisabled?: () => boolean;
  allowInsecureSocket?: boolean;
}

export interface McpToolCallResponse {
  result?: { content: unknown };
  error?: { content?: unknown };
  content?: unknown;
  is_error?: boolean;
}

export interface McpNotificationPayload {
  method: string;
  params?: unknown;
}

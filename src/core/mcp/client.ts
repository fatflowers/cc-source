import type {
  McpConnectionStatus,
  McpResourceContent,
  McpResourceDescriptor,
  McpServerConfig,
  McpToolCallInput,
  McpToolResult,
} from "./types.js";

export interface McpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listResources(): Promise<McpResourceDescriptor[]>;
  readResource(uri: string): Promise<McpResourceContent>;
  callTool(input: McpToolCallInput): Promise<McpToolResult>;
}

class InMemoryTransport implements McpTransport {
  private resources: McpResourceContent[];

  constructor(resources: McpResourceContent[] = []) {
    this.resources = resources;
  }

  async connect() {
    return;
  }

  async disconnect() {
    return;
  }

  async listResources() {
    return this.resources.map((resource) => ({
      uri: resource.uri,
      name: resource.uri,
      description: resource.mimeType,
    }));
  }

  async readResource(uri: string) {
    const match = this.resources.find((resource) => resource.uri === uri);
    if (!match) {
      throw new Error(`MCP resource not found: ${uri}`);
    }
    return match;
  }

  async callTool(input: McpToolCallInput) {
    return {
      content: {
        message: `MCP tool '${input.name}' invoked`,
        input: input.input,
      },
    };
  }
}

export class McpClient {
  readonly config: McpServerConfig;
  status: McpConnectionStatus = "disconnected";
  private transport: McpTransport;
  private lastError: Error | null = null;

  constructor(config: McpServerConfig, transport?: McpTransport) {
    this.config = config;
    this.transport = transport ?? new InMemoryTransport();
  }

  get error() {
    return this.lastError;
  }

  async connect() {
    try {
      await this.transport.connect();
      this.status = "connected";
      this.lastError = null;
    } catch (error) {
      this.status = "error";
      this.lastError = error instanceof Error ? error : new Error(String(error));
      throw this.lastError;
    }
  }

  async disconnect() {
    await this.transport.disconnect();
    this.status = "disconnected";
  }

  async listResources() {
    return this.transport.listResources();
  }

  async readResource(uri: string) {
    return this.transport.readResource(uri);
  }

  async callTool(input: McpToolCallInput) {
    return this.transport.callTool(input);
  }
}

import { basename } from "node:path";
import type { McpClientContext, McpNotificationPayload, McpToolCallInput, McpToolCallResponse } from "./types.js";
import { SocketBridgeClient, createSocketClient } from "./socketClient.js";
import { BridgeClient, createBridgeClient } from "./bridgeClient.js";

type NotificationHandler = (payload: McpNotificationPayload) => void;

type SocketEntry = {
  serverName: string;
  socketPath: string;
  client: SocketBridgeClient;
};

function deriveServerName(socketPath: string) {
  const name = basename(socketPath);
  return name.replace(/\.sock$/i, "");
}

export class McpClientPool {
  private socketClients = new Map<string, SocketEntry>();
  private tabRoutes = new Map<string, string>();
  private tabsContext = new Map<string, unknown>();
  private bridgeClient: BridgeClient | null = null;
  private notificationHandler: NotificationHandler | null = null;

  constructor(private readonly context: McpClientContext) {
    if (context.bridgeConfig) {
      this.bridgeClient = createBridgeClient(context);
    }
  }

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
    for (const entry of this.socketClients.values()) {
      entry.client.setNotificationHandler((payload) => this.handleNotification(entry.serverName, payload));
    }
    this.bridgeClient?.setNotificationHandler((payload) => this.handleNotification("bridge", payload));
  }

  async refreshClients() {
    const entries = this.resolveSocketEntries();
    const next = new Map<string, SocketEntry>();

    for (const entry of entries) {
      const existing = this.socketClients.get(entry.serverName);
      if (existing && existing.socketPath === entry.socketPath) {
        next.set(entry.serverName, existing);
        continue;
      }
      const client = createSocketClient({
        ...this.context,
        serverName: entry.serverName,
        socketPath: entry.socketPath,
        getSocketPath: () => entry.socketPath,
        getSocketPaths: undefined,
      });
      client.setNotificationHandler((payload) => this.handleNotification(entry.serverName, payload));
      next.set(entry.serverName, { ...entry, client });
    }

    this.socketClients = next;
  }

  async callTool(input: McpToolCallInput & { serverName?: string; tabId?: string }): Promise<McpToolCallResponse> {
    const serverName = this.resolveServerName(input.serverName, input.tabId);
    if (serverName && this.socketClients.has(serverName)) {
      const entry = this.socketClients.get(serverName);
      if (!entry) throw new Error(`MCP server not found: ${serverName}`);
      return entry.client.callTool(input);
    }
    if (this.bridgeClient) {
      return this.bridgeClient.callTool(input);
    }
    throw new Error("No MCP bridge or socket client available");
  }

  async connectAll() {
    for (const entry of this.socketClients.values()) {
      await entry.client.ensureConnected();
    }
    if (this.bridgeClient) await this.bridgeClient.connect();
  }

  getTabsContext() {
    return Array.from(this.tabsContext.values());
  }

  private handleNotification(serverName: string, payload: McpNotificationPayload) {
    if (payload.method === "tabs_context_mcp") {
      this.updateTabsContext(serverName, payload.params);
    }
    this.notificationHandler?.(payload);
  }

  private updateTabsContext(serverName: string, params: unknown) {
    if (!params || typeof params !== "object") return;
    this.tabsContext.set(serverName, params);
    const tabs = (params as any).tabs;
    if (!Array.isArray(tabs)) return;
    for (const tab of tabs) {
      const tabId = tab?.id ?? tab?.tab_id;
      const socketPath = tab?.socket_path;
      const server = tab?.server_name ?? (typeof socketPath === "string" ? this.findServerNameBySocket(socketPath) : undefined);
      if (tabId && server) this.tabRoutes.set(String(tabId), server);
    }
  }

  private resolveServerName(serverName?: string, tabId?: string) {
    if (serverName) return serverName;
    if (tabId && this.tabRoutes.has(tabId)) return this.tabRoutes.get(tabId);
    return undefined;
  }

  private findServerNameBySocket(socketPath: string) {
    for (const entry of this.socketClients.values()) {
      if (entry.socketPath === socketPath) return entry.serverName;
    }
    return undefined;
  }

  private resolveSocketEntries(): Array<{ serverName: string; socketPath: string }> {
    const list = this.context.getSocketPaths?.() ?? [];
    if (list.length === 0) {
      const socketPath = this.context.getSocketPath?.() ?? this.context.socketPath;
      if (socketPath) return [{ serverName: deriveServerName(socketPath), socketPath }];
    }
    return list.map((entry) => {
      if (typeof entry === "string") {
        return { serverName: deriveServerName(entry), socketPath: entry };
      }
      return entry;
    });
  }
}

export function createMcpClientPool(context: McpClientContext) {
  return new McpClientPool(context);
}

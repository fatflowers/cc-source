import type { McpBridgeConfig, McpClientContext, McpNotificationPayload, McpToolCallInput, McpToolCallResponse } from "./types.js";

type NotificationHandler = (payload: McpNotificationPayload) => void;

type WsLike = {
  send(data: string): void;
  close(): void;
  addEventListener?: (event: string, handler: (event: any) => void) => void;
  on?: (event: string, handler: (event: any) => void) => void;
  readyState?: number;
};

function isNotification(payload: unknown): payload is McpNotificationPayload {
  return !!payload && typeof payload === "object" && "method" in payload;
}

function isToolResultMessage(payload: any): payload is { type?: string; result?: unknown; error?: unknown } {
  return !!payload && typeof payload === "object" && (payload.type === "tool_result" || "result" in payload || "error" in payload);
}

async function createWebSocket(url: string, headers: Record<string, string>): Promise<WsLike> {
  if (typeof (globalThis as any).WebSocket === "function") {
    const ws = new (globalThis as any).WebSocket(url);
    return ws;
  }
  const mod = await import("ws");
  const WebSocketCtor = (mod as any).WebSocket ?? (mod as any).default;
  return new WebSocketCtor(url, { headers });
}

export class BridgeClient {
  private ws: WsLike | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private responseResolver: ((payload: McpToolCallResponse) => void) | null = null;
  private responseRejecter: ((error: Error) => void) | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private permissionMode: string | undefined;

  constructor(private readonly context: McpClientContext, private readonly bridge: McpBridgeConfig) {
    this.permissionMode = context.initialPermissionMode;
  }

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
  }

  setPermissionMode(mode: string | undefined) {
    this.permissionMode = mode;
  }

  isConnected() {
    return this.connected;
  }

  async connect() {
    const { logger, serverName } = this.context;
    if (this.context.isDisabled?.()) return;

    const headers: Record<string, string> = {};
    const token = await this.bridge.getOAuthToken?.();
    const userId = await this.bridge.getUserId?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (this.bridge.devUserId) headers["x-dev-user-id"] = this.bridge.devUserId;
    if (userId) headers["x-user-id"] = userId;

    this.ws = await createWebSocket(this.bridge.url, headers);
    this.attachListeners();
    logger.info(`[${serverName}] MCP bridge connecting to ${this.bridge.url}`);
  }

  async disconnect() {
    this.clearReconnectTimer();
    this.connected = false;
    this.ws?.close();
    this.ws = null;
  }

  async callTool(input: McpToolCallInput): Promise<McpToolCallResponse> {
    if (!this.ws) {
      await this.connect();
    }
    if (!this.ws) throw new Error("Bridge websocket unavailable");

    const payload = {
      type: "tool_call",
      client_id: this.context.clientTypeId,
      tool: input.name,
      args: input.input,
      permission_mode: this.permissionMode,
    };

    this.sendJson(payload);

    return await new Promise<McpToolCallResponse>((resolve, reject) => {
      this.responseResolver = resolve;
      this.responseRejecter = reject;
    });
  }

  private attachListeners() {
    if (!this.ws) return;
    const { logger, serverName } = this.context;
    const onMessage = (event: any) => {
      const data = typeof event?.data === "string" ? event.data : typeof event === "string" ? event : event?.toString?.();
      if (!data) return;
      for (const line of data.split("\n").filter((chunk: string) => chunk.trim().length > 0)) {
        try {
          const parsed = JSON.parse(line);
          if (isNotification(parsed)) {
            this.notificationHandler?.(parsed);
            continue;
          }
          if (isToolResultMessage(parsed)) {
            this.handleResponse(parsed);
          }
        } catch (error) {
          logger.debug?.(`[${serverName}] Failed to parse MCP bridge message`, error);
        }
      }
    };

    const onOpen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info(`[${serverName}] MCP bridge connected`);
    };

    const onClose = () => {
      this.connected = false;
      logger.warn(`[${serverName}] MCP bridge disconnected`);
      this.scheduleReconnect();
    };

    const onError = (error: any) => {
      this.connected = false;
      logger.warn(`[${serverName}] MCP bridge error`, error);
      if (String(error?.message || "").includes("401")) {
        this.context.onAuthenticationError?.();
      }
      this.scheduleReconnect();
    };

    if (this.ws.addEventListener) {
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("message", onMessage);
      this.ws.addEventListener("close", onClose);
      this.ws.addEventListener("error", onError);
    } else if (this.ws.on) {
      this.ws.on("open", onOpen);
      this.ws.on("message", onMessage);
      this.ws.on("close", onClose);
      this.ws.on("error", onError);
    }
  }

  private handleResponse(payload: any) {
    if (!this.responseResolver) return;
    const resolve = this.responseResolver;
    this.responseResolver = null;
    this.responseRejecter = null;
    if (payload?.error) {
      resolve({ error: payload.error, is_error: true, content: payload.error });
      return;
    }
    if (payload?.result) {
      resolve({ result: payload.result, content: (payload.result as any)?.content ?? payload.result });
      return;
    }
    resolve({ content: payload?.content ?? payload });
  }

  private sendJson(payload: unknown) {
    if (!this.ws) return;
    this.ws.send(JSON.stringify(payload));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

export function createBridgeClient(context: McpClientContext) {
  if (!context.bridgeConfig) return null;
  return new BridgeClient(context, context.bridgeConfig);
}

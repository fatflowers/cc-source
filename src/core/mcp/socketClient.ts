import { connect, type Socket } from "node:net";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpClientContext, McpNotificationPayload, McpToolCallInput, McpToolCallResponse } from "./types.js";

type NotificationHandler = (payload: McpNotificationPayload) => void;

function isNotification(payload: unknown): payload is McpNotificationPayload {
  return !!payload && typeof payload === "object" && "method" in payload;
}

function isResponse(payload: unknown): payload is McpToolCallResponse {
  return !!payload && typeof payload === "object" && ("result" in payload || "error" in payload || "is_error" in payload);
}

export class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocketConnectionError";
  }
}

export class SocketBridgeClient {
  private socket: Socket | null = null;
  private connected = false;
  private connecting = false;
  private responseBuffer = Buffer.alloc(0);
  private responseResolver: ((payload: McpToolCallResponse) => void) | null = null;
  private responseRejecter: ((error: Error) => void) | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingQueue: Promise<void> = Promise.resolve();

  public disableAutoReconnect = false;

  constructor(private readonly context: McpClientContext) {}

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
  }

  isConnected() {
    return this.connected;
  }

  async ensureConnected() {
    if (this.connected || this.connecting) return;
    await this.connect();
  }

  async connect() {
    const { logger, serverName } = this.context;
    if (this.context.isDisabled?.()) {
      logger.info(`[${serverName}] MCP client disabled; skipping connect`);
      return;
    }
    if (this.connecting) return;
    this.connecting = true;
    this.closeSocket();

    const socketPath = this.context.getSocketPath?.() ?? this.context.socketPath;
    if (!socketPath) {
      this.connecting = false;
      return;
    }

    logger.info(`[${serverName}] Attempting to connect to socket: ${socketPath}`);
    await this.validateSocketSecurity(socketPath);

    const socket = connect(socketPath);
    this.socket = socket;

    const timeout = setTimeout(() => {
      if (!this.connected) {
        logger.info(`[${serverName}] Socket connect timed out after 5000ms`);
        this.closeSocket();
        this.scheduleReconnect();
      }
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      logger.info(`[${serverName}] Socket connected`);
    });

    socket.on("data", (chunk) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);
      while (this.responseBuffer.length >= 4) {
        const length = this.responseBuffer.readUInt32LE(0);
        if (this.responseBuffer.length < 4 + length) break;
        const payload = this.responseBuffer.slice(4, 4 + length);
        this.responseBuffer = this.responseBuffer.slice(4 + length);
        this.handlePayload(payload);
      }
    });

    socket.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      logger.info(`[${serverName}] Socket error (${error.code ?? "unknown"})`, error);
      this.connected = false;
      this.connecting = false;
      this.rejectInFlight(error instanceof Error ? error : new Error(String(error)));
      if (this.shouldReconnect(error)) this.scheduleReconnect();
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      logger.info(`[${serverName}] Socket closed`);
      this.connected = false;
      this.connecting = false;
      if (!this.disableAutoReconnect) this.scheduleReconnect();
    });
  }

  async disconnect() {
    this.disableAutoReconnect = true;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  async callTool(input: McpToolCallInput): Promise<McpToolCallResponse> {
    return this.queue(async () => {
      await this.ensureConnected();
      if (!this.socket || !this.connected) {
        throw new SocketConnectionError("Socket not connected");
      }

      const payload = {
        method: "execute_tool",
        params: {
          client_id: this.context.clientTypeId,
          tool: input.name,
          args: input.input,
        },
      };

      const encoded = Buffer.from(JSON.stringify(payload), "utf8");
      const header = Buffer.alloc(4);
      header.writeUInt32LE(encoded.length, 0);
      this.socket.write(Buffer.concat([header, encoded]));

      return await new Promise<McpToolCallResponse>((resolve, reject) => {
        this.responseResolver = resolve;
        this.responseRejecter = reject;
      });
    });
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pendingQueue.then(task, task);
    this.pendingQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private handlePayload(payload: Buffer) {
    const { logger, serverName } = this.context;
    try {
      const parsed = JSON.parse(payload.toString("utf8"));
      if (isNotification(parsed)) {
        logger.info(`[${serverName}] Notification: ${parsed.method}`);
        this.notificationHandler?.(parsed);
        return;
      }
      if (isResponse(parsed)) {
        this.handleResponse(parsed);
        return;
      }
      logger.info(`[${serverName}] Unknown socket payload: ${payload.toString("utf8")}`);
    } catch (error) {
      logger.info(`[${serverName}] Failed to parse socket payload`, error);
    }
  }

  private handleResponse(payload: McpToolCallResponse) {
    if (!this.responseResolver) return;
    const resolve = this.responseResolver;
    this.responseResolver = null;
    this.responseRejecter = null;
    resolve(payload);
  }

  private rejectInFlight(error: Error) {
    if (!this.responseRejecter) return;
    const reject = this.responseRejecter;
    this.responseResolver = null;
    this.responseRejecter = null;
    reject(error);
  }

  private shouldReconnect(error: NodeJS.ErrnoException) {
    if (this.disableAutoReconnect) return false;
    const codes = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOENT", "EOPNOTSUPP", "ECONNABORTED"]);
    return error.code ? codes.has(error.code) : true;
  }

  private scheduleReconnect() {
    if (this.disableAutoReconnect) return;
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

  private closeSocket() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.destroy();
    this.socket = null;
    this.connected = false;
    this.connecting = false;
  }

  private async validateSocketSecurity(socketPath: string) {
    const { logger, serverName } = this.context;
    try {
      const fileStat = await stat(socketPath);
      const dirStat = await stat(dirname(socketPath));
      const fileMode = fileStat.mode & 0o777;
      const dirMode = dirStat.mode & 0o777;
      const fileWorldWritable = (fileMode & 0o002) !== 0;
      const dirWorldWritable = (dirMode & 0o002) !== 0;
      if ((fileWorldWritable || dirWorldWritable) && !this.context.allowInsecureSocket) {
        throw new SocketConnectionError("Socket permissions are too permissive");
      }
      if (fileWorldWritable || dirWorldWritable) {
        logger.warn(`[${serverName}] Socket permissions are permissive; proceeding anyway`);
      }
    } catch (error) {
      if (error instanceof SocketConnectionError) throw error;
      logger.warn(`[${serverName}] Unable to validate socket permissions; proceeding anyway`);
    }
  }
}

export function createSocketClient(context: McpClientContext) {
  return new SocketBridgeClient(context);
}

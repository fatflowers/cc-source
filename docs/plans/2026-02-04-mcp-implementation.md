# MCP System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore MCP socket bridge, WebSocket bridge, pooling, and tool dispatch in TypeScript.

**Architecture:** Add `socketClient`, `bridgeClient`, `poolClient`, and a dispatch helper under `src/core/mcp/`. Expand MCP types and export the new modules via `src/core/mcp/index.ts`.

**Tech Stack:** TypeScript (ESM), Node `net`, `fs/promises`, `ws` (or native WebSocket), and `crypto`.

---

### Task 1: Types + Socket Bridge Client

**Files:**
- Create: `src/core/mcp/socketClient.ts`
- Modify: `src/core/mcp/types.ts`
- Test: `tests/core/mcp/socketClient.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/mcp/socketClient.test.mjs
import assert from "node:assert/strict";
import { createSocketClient } from "../../src/core/mcp/socketClient.ts";

const client = createSocketClient({
  serverName: "test",
  socketPath: "/tmp/does-not-exist",
  logger: { info() {}, debug() {}, warn() {}, error() {}, silly() {} },
  clientTypeId: "test-client",
});

assert.equal(typeof client.ensureConnected, "function");
assert.equal(typeof client.callTool, "function");
assert.equal(typeof client.setNotificationHandler, "function");

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/socketClient.test.mjs`
Expected: FAIL with “Cannot find module …/socketClient.ts”.

**Step 3: Write minimal implementation**

```ts
// src/core/mcp/types.ts (append)
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
  getSocketPaths?: () => string[];
  bridgeConfig?: McpBridgeConfig;
  initialPermissionMode?: string;
  onAuthenticationError?: () => void;
  isDisabled?: () => boolean;
}

export interface McpToolCallResponse {
  result?: { content: unknown };
  error?: { content?: unknown };
  content?: unknown;
  is_error?: boolean;
}
```

```ts
// src/core/mcp/socketClient.ts
import { connect } from "node:net";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpClientContext, McpToolCallResponse } from "./types.js";

type NotificationHandler = (payload: { method: string; params?: unknown }) => void;

function isNotification(payload: any): payload is { method: string } {
  return payload && typeof payload.method === "string";
}

function isResponse(payload: any): payload is McpToolCallResponse {
  return payload && ("result" in payload || "error" in payload);
}

export class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocketConnectionError";
  }
}

export class SocketBridgeClient {
  private socket: ReturnType<typeof connect> | null = null;
  private connected = false;
  private connecting = false;
  private responseCallback: ((payload: McpToolCallResponse) => void) | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private responseBuffer = Buffer.alloc(0);
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  public disableAutoReconnect = false;

  constructor(private readonly context: McpClientContext) {}

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
  }

  isConnected() {
    return this.connected;
  }

  async connect() {
    const { serverName, logger } = this.context;
    if (this.connecting) {
      logger.info(`[${serverName}] Already connecting, skipping duplicate attempt`);
      return;
    }
    this.closeSocket();
    this.connecting = true;
    const socketPath = this.context.getSocketPath?.() ?? this.context.socketPath;
    logger.info(`[${serverName}] Attempting to connect to: ${socketPath}`);
    if (!socketPath) {
      this.connecting = false;
      return;
    }
    await this.validateSocketSecurity(socketPath);
    this.socket = connect(socketPath);
    const timeout = setTimeout(() => {
      if (!this.connected) {
        logger.info(`[${serverName}] Connection attempt timed out after 5000ms`);
        this.closeSocket();
        this.scheduleReconnect();
      }
    }, 5000);

    this.socket.on("connect", () => {
      clearTimeout(timeout);
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      logger.info(`[${serverName}] Successfully connected to bridge server`);
    });

    this.socket.on("data", (chunk) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);
      while (this.responseBuffer.length >= 4) {
        const length = this.responseBuffer.readUInt32LE(0);
        if (this.responseBuffer.length < 4 + length) break;
        const payload = this.responseBuffer.slice(4, 4 + length);
        this.responseBuffer = this.responseBuffer.slice(4 + length);
        try {
          const parsed = JSON.parse(payload.toString("utf-8"));
          if (isNotification(parsed)) {
            logger.info(`[${serverName}] Received notification: ${parsed.method}`);
            this.notificationHandler?.(parsed);
          } else if (isResponse(parsed)) {
            logger.info(`[${serverName}] Received tool response: ${JSON.stringify(parsed)}`);
            this.handleResponse(parsed);
          } else {
            logger.info(`[${serverName}] Received unknown message: ${JSON.stringify(parsed)}`);
          }
        } catch (error) {
          logger.info(`[${serverName}] Failed to parse message:`, error);
        }
      }
    });

    this.socket.on("error", (err: any) => {
      clearTimeout(timeout);
      logger.info(`[${serverName}] Socket error (code: ${err?.code}):`, err);
      this.connected = false;
      this.connecting = false;
      if (err?.code && ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOENT", "EOPNOTSUPP", "ECONNABORTED"].includes(err.code)) {
        this.scheduleReconnect();
      }
    });

    this.socket.on("close", () => {
      clearTimeout(timeout);
      this.connected = false;
      this.connecting = false;
      this.scheduleReconnect();
    });
  }

  async ensureConnected() {
    const { serverName } = this.context;
    if (this.connected && this.socket) return true;
    if (!this.socket && !this.connecting) await this.connect();
    return new Promise<boolean>((resolve, reject) => {
      let pollTimer: NodeJS.Timeout | null = null;
      const timeout = setTimeout(() => {
        if (pollTimer) clearTimeout(pollTimer);
        reject(new SocketConnectionError(`[${serverName}] Connection attempt timed out after 5000ms`));
      }, 5000);
      const poll = () => {
        if (this.connected) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          pollTimer = setTimeout(poll, 500);
        }
      };
      poll();
    });
  }

  async sendRequest(payload: unknown, timeoutMs = 30000): Promise<McpToolCallResponse> {
    const { serverName } = this.context;
    if (!this.socket) throw new SocketConnectionError(`[${serverName}] Cannot send request: not connected`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseCallback = null;
        reject(new SocketConnectionError(`[${serverName}] Tool request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.responseCallback = (resp) => {
        clearTimeout(timer);
        resolve(resp);
      };
      const raw = JSON.stringify(payload);
      const data = Buffer.from(raw, "utf-8");
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32LE(data.length, 0);
      this.socket?.write(Buffer.concat([header, data]));
    });
  }

  async sendRequestWithRetry(payload: unknown): Promise<McpToolCallResponse> {
    const { serverName, logger } = this.context;
    try {
      return await this.sendRequest(payload);
    } catch (error) {
      if (!(error instanceof SocketConnectionError)) throw error;
      logger.info(`[${serverName}] Connection error, forcing reconnect and retrying: ${error.message}`);
      this.closeSocket();
      await this.ensureConnected();
      return this.sendRequest(payload);
    }
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const payload = { method: "execute_tool", params: { client_id: this.context.clientTypeId, tool: name, args } };
    return this.sendRequestWithRetry(payload);
  }

  async setPermissionMode(_mode: string, _domains?: string[]) {
    return;
  }

  disconnect() {
    this.cleanup();
  }

  cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
    this.reconnectAttempts = 0;
    this.responseBuffer = Buffer.alloc(0);
    this.responseCallback = null;
  }

  private handleResponse(payload: McpToolCallResponse) {
    if (this.responseCallback) {
      const cb = this.responseCallback;
      this.responseCallback = null;
      cb(payload);
    }
  }

  private scheduleReconnect() {
    const { logger, serverName } = this.context;
    if (this.disableAutoReconnect) return;
    if (this.reconnectTimer) {
      logger.info(`[${serverName}] Reconnect already scheduled, skipping`);
      return;
    }
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > 100) {
      logger.info(`[${serverName}] Giving up after 100 attempts. Will retry on next tool call.`);
      this.reconnectAttempts = 0;
      return;
    }
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    if (this.reconnectAttempts <= 10 || this.reconnectAttempts % 10 === 0) {
      logger.info(`[${serverName}] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private closeSocket() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  private async validateSocketSecurity(socketPath: string) {
    const { serverName, logger } = this.context;
    if (process.platform === "win32") return;
    try {
      const dir = dirname(socketPath);
      if ((dir.split("/").pop() || "").startsWith("claude-mcp-browser-bridge-")) {
        try {
          const st = await stat(dir);
          if (st.isDirectory()) {
            const mode = st.mode & 0o777;
            if (mode !== 0o700) {
              throw new Error(
                `[${serverName}] Insecure socket directory permissions: ${mode.toString(8)} (expected 0700).`
              );
            }
            const uid = process.getuid?.();
            if (uid !== undefined && st.uid !== uid) {
              throw new Error(`Socket directory not owned by current user (uid: ${uid}, dir uid: ${st.uid}).`);
            }
          }
        } catch (err: any) {
          if (err?.code !== "ENOENT") throw err;
        }
      }
      const st = await stat(socketPath);
      if (!st.isSocket()) throw new Error(`[${serverName}] Path exists but it's not a socket: ${socketPath}`);
      const mode = st.mode & 0o777;
      if (mode !== 0o600) {
        throw new Error(
          `[${serverName}] Insecure socket permissions: ${mode.toString(8)} (expected 0600).`
        );
      }
      const uid = process.getuid?.();
      if (uid !== undefined && st.uid !== uid) {
        throw new Error(`Socket not owned by current user (uid: ${uid}, socket uid: ${st.uid}).`);
      }
      logger.info(`[${serverName}] Socket security validation passed`);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        logger.info(`[${serverName}] Socket not found, will be created by server`);
        return;
      }
      throw err;
    }
  }
}

export function createSocketClient(context: McpClientContext) {
  return new SocketBridgeClient(context);
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/socketClient.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add src/core/mcp/types.ts src/core/mcp/socketClient.ts tests/core/mcp/socketClient.test.mjs
git commit -m "feat: add MCP socket bridge client"
```

---

### Task 2: WebSocket Bridge Client

**Files:**
- Create: `src/core/mcp/bridgeClient.ts`
- Test: `tests/core/mcp/bridgeClient.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/mcp/bridgeClient.test.mjs
import assert from "node:assert/strict";
import { createBridgeClient } from "../../src/core/mcp/bridgeClient.ts";

const client = createBridgeClient({
  serverName: "bridge",
  logger: { info() {}, debug() {}, warn() {}, error() {}, silly() {} },
  clientTypeId: "test-client",
  bridgeConfig: { url: "wss://example.invalid" },
});

assert.equal(typeof client.ensureConnected, "function");
assert.equal(typeof client.callTool, "function");
console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/bridgeClient.test.mjs`
Expected: FAIL with “Cannot find module …/bridgeClient.ts”.

**Step 3: Write minimal implementation**

```ts
// src/core/mcp/bridgeClient.ts
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { McpClientContext, McpToolCallResponse } from "./types.js";

type NotificationHandler = (payload: { method: string; params?: unknown }) => void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private authenticated = false;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private pendingCalls = new Map<
    string,
    { resolve: (resp: McpToolCallResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout; results: McpToolCallResponse[]; isTabsContext: boolean }
  >();
  private notificationHandler: NotificationHandler | null = null;
  private permissionMode = "ask";
  private allowedDomains?: string[];
  private tabsContextCollectionTimeoutMs = 2000;
  private toolCallTimeoutMs = 120000;

  constructor(private readonly context: McpClientContext) {
    if (context.initialPermissionMode) this.permissionMode = context.initialPermissionMode;
  }

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
  }

  async setPermissionMode(mode: string, domains?: string[]) {
    this.permissionMode = mode;
    this.allowedDomains = domains;
  }

  isConnected() {
    return this.connected && this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  async ensureConnected() {
    const { logger, serverName } = this.context;
    logger.info(
      `[${serverName}] ensureConnected called, connected=${this.connected}, authenticated=${this.authenticated}, wsState=${this.ws?.readyState}`
    );
    if (this.isConnected()) {
      logger.info(`[${serverName}] Already connected and authenticated`);
      return true;
    }
    if (!this.connecting) {
      logger.info(`[${serverName}] Not connecting, starting connection...`);
      await this.connect();
    } else {
      logger.info(`[${serverName}] Already connecting, waiting...`);
    }
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        logger.info(`[${serverName}] Connection timeout, connected=${this.connected}, authenticated=${this.authenticated}`);
        resolve(false);
      }, 10000);
      const poll = () => {
        if (this.connected && this.authenticated) {
          logger.info(`[${serverName}] Connection successful`);
          clearTimeout(timeout);
          resolve(true);
        } else if (!this.connecting) {
          logger.info(`[${serverName}] No longer connecting, giving up`);
          clearTimeout(timeout);
          resolve(false);
        } else {
          setTimeout(poll, 200);
        }
      };
      poll();
    });
  }

  async callTool(tool: string, args: Record<string, unknown>) {
    const { logger, serverName } = this.context;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error(`[${serverName}] Bridge not connected`);
    const toolUseId = randomUUID();
    const isTabsContext = tool === "tabs_context_mcp";

    return new Promise<McpToolCallResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingCalls.get(toolUseId);
        if (!pending) return;
        this.pendingCalls.delete(toolUseId);
        if (isTabsContext && pending.results.length > 0) {
          resolve(this.mergeTabsResults(pending.results));
        } else {
          reject(new Error(`[${serverName}] Tool call timed out: ${tool}`));
        }
      }, isTabsContext ? this.tabsContextCollectionTimeoutMs : this.toolCallTimeoutMs);

      this.pendingCalls.set(toolUseId, { resolve, reject, timer, results: [], isTabsContext });
      const payload: any = {
        type: "tool_call",
        tool_use_id: toolUseId,
        client_type: this.context.clientTypeId,
        tool,
        args,
        permission_mode: this.permissionMode,
      };
      if (this.allowedDomains?.length) payload.allowed_domains = this.allowedDomains;
      logger.debug(`[${serverName}] Sending tool_call: ${tool} (${toolUseId.slice(0, 8)})`);
      this.ws?.send(JSON.stringify(payload));
    });
  }

  async connect() {
    const { logger, serverName, bridgeConfig } = this.context;
    if (!bridgeConfig) {
      logger.error(`[${serverName}] No bridge config provided`);
      return;
    }
    if (this.connecting) return;
    this.connecting = true;
    this.authenticated = false;
    this.closeSocket();

    let userId: string | undefined;
    let token: string | undefined;
    if (bridgeConfig.devUserId) {
      userId = bridgeConfig.devUserId;
    } else {
      const fetchedUser = await bridgeConfig.getUserId?.();
      if (!fetchedUser) {
        logger.error(`[${serverName}] No user ID available`);
        this.connecting = false;
        this.context.onAuthenticationError?.();
        return;
      }
      userId = fetchedUser;
      token = await bridgeConfig.getOAuthToken?.() ?? undefined;
      if (!token) {
        logger.error(`[${serverName}] No OAuth token available`);
        this.connecting = false;
        this.context.onAuthenticationError?.();
        return;
      }
    }

    const url = `${bridgeConfig.url}/chrome/${userId}`;
    logger.info(`[${serverName}] Connecting to bridge: ${url}`);
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.connecting = false;
      logger.error(`[${serverName}] Failed to create WebSocket:`, err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      logger.info(`[${serverName}] WebSocket connected, sending connect`);
      const connectMsg: any = { type: "connect", client_type: this.context.clientTypeId };
      if (bridgeConfig.devUserId) connectMsg.dev_user_id = bridgeConfig.devUserId;
      else connectMsg.oauth_token = token;
      this.ws?.send(JSON.stringify(connectMsg));
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        logger.debug(`[${serverName}] Bridge received: ${JSON.stringify(msg)}`);
        this.handleMessage(msg);
      } catch (err) {
        logger.error(`[${serverName}] Failed to parse message:`, err);
      }
    });

    this.ws.on("close", (code) => {
      logger.info(`[${serverName}] Bridge connection closed (code: ${code})`);
      this.connected = false;
      this.authenticated = false;
      this.connecting = false;
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: any) => {
      logger.error(`[${serverName}] Bridge WebSocket error: ${err?.message ?? String(err)}`);
      this.connected = false;
      this.authenticated = false;
      this.connecting = false;
    });
  }

  disconnect() {
    this.cleanup();
  }

  cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Bridge client disconnected"));
      this.pendingCalls.delete(id);
    }
    this.closeSocket();
    this.reconnectAttempts = 0;
  }

  private handleMessage(msg: any) {
    const { logger, serverName } = this.context;
    switch (msg.type) {
      case "paired":
        logger.info(`[${serverName}] Paired with Chrome extension`);
        this.connected = true;
        this.authenticated = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        break;
      case "waiting":
        logger.info(`[${serverName}] Waiting for Chrome extension to connect`);
        this.connected = true;
        this.authenticated = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        break;
      case "peer_connected":
        logger.info(`[${serverName}] Chrome extension connected`);
        break;
      case "peer_disconnected":
        logger.info(`[${serverName}] Chrome extension disconnected`);
        break;
      case "ping":
        this.ws?.send(JSON.stringify({ type: "pong" }));
        break;
      case "pong":
        break;
      case "tool_result":
        this.handleToolResult(msg);
        break;
      case "notification":
        this.notificationHandler?.({ method: msg.method, params: msg.params });
        break;
      case "error":
        logger.error(`[${serverName}] Bridge error: ${msg.error}`);
        break;
      default:
        logger.debug(`[${serverName}] Unknown bridge message type: ${msg.type}`);
    }
  }

  private handleToolResult(msg: any) {
    const toolUseId = msg.tool_use_id;
    if (!toolUseId) return;
    const pending = this.pendingCalls.get(toolUseId);
    if (!pending) return;
    const normalized = this.normalizeBridgeResponse(msg);
    if (pending.isTabsContext) {
      pending.results.push(normalized);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingCalls.delete(toolUseId);
    pending.resolve(normalized);
  }

  private normalizeBridgeResponse(msg: any): McpToolCallResponse {
    if (msg.result || msg.error) return msg;
    if (msg.content) {
      if (msg.is_error) return { error: { content: msg.content } };
      return { result: { content: msg.content } };
    }
    return msg;
  }

  private mergeTabsResults(results: McpToolCallResponse[]): McpToolCallResponse {
    const tabs: any[] = [];
    for (const res of results) {
      const content = res.result?.content;
      if (!content || !Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === "text" && block.text) {
          try {
            const parsed = JSON.parse(block.text);
            if (Array.isArray(parsed)) tabs.push(...parsed);
            else if (parsed?.availableTabs && Array.isArray(parsed.availableTabs)) tabs.push(...parsed.availableTabs);
          } catch {}
        }
      }
    }
    if (tabs.length > 0) {
      const lines = tabs.map((t: any) => `  • tabId ${t.tabId}: "${t.title}" (${t.url})`).join("\n");
      return {
        result: {
          content: [
            { type: "text", text: JSON.stringify({ availableTabs: tabs }) },
            { type: "text", text: `\n\nTab Context:\n- Available tabs:\n${lines}` },
          ],
        },
      };
    }
    return results[0];
  }

  private scheduleReconnect() {
    const { logger, serverName } = this.context;
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > 100) {
      logger.info(`[${serverName}] Giving up bridge reconnection after 100 attempts`);
      this.reconnectAttempts = 0;
      return;
    }
    const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    if (this.reconnectAttempts <= 10 || this.reconnectAttempts % 10 === 0) {
      logger.info(`[${serverName}] Bridge reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private closeSocket() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
  }
}

export function createBridgeClient(context: McpClientContext) {
  return new BridgeClient(context);
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/bridgeClient.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add src/core/mcp/bridgeClient.ts tests/core/mcp/bridgeClient.test.mjs
git commit -m "feat: add MCP bridge client"
```

---

### Task 3: Pool Client + Dispatch Helper + Exports

**Files:**
- Create: `src/core/mcp/poolClient.ts`
- Create: `src/core/mcp/dispatch.ts`
- Modify: `src/core/mcp/index.ts`
- Test: `tests/core/mcp/poolClient.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/mcp/poolClient.test.mjs
import assert from "node:assert/strict";
import { createPoolClient } from "../../src/core/mcp/poolClient.ts";

const pool = createPoolClient({
  serverName: "pool",
  logger: { info() {}, debug() {}, warn() {}, error() {}, silly() {} },
  clientTypeId: "test-client",
  getSocketPaths: () => [],
});

assert.equal(typeof pool.ensureConnected, "function");
assert.equal(typeof pool.callTool, "function");

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/poolClient.test.mjs`
Expected: FAIL with “Cannot find module …/poolClient.ts”.

**Step 3: Write minimal implementation**

```ts
// src/core/mcp/poolClient.ts
import type { McpClientContext, McpToolCallResponse } from "./types.js";
import { createSocketClient, SocketBridgeClient, SocketConnectionError } from "./socketClient.js";

type NotificationHandler = (payload: { method: string; params?: unknown }) => void;

export class SocketPoolClient {
  private clients = new Map<string, SocketBridgeClient>();
  private tabRoutes = new Map<number, string>();
  private notificationHandler: NotificationHandler | null = null;

  constructor(private readonly context: McpClientContext) {}

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
    for (const client of this.clients.values()) client.setNotificationHandler(handler);
  }

  async ensureConnected() {
    const { logger, serverName } = this.context;
    this.refreshClients();
    const attempts = Array.from(this.clients.values()).map((client) =>
      client.isConnected() ? Promise.resolve(true) : client.ensureConnected().catch(() => false)
    );
    if (attempts.length > 0) await Promise.all(attempts);
    const connected = this.getConnectedClients().length;
    if (connected === 0) {
      logger.info(`[${serverName}] No connected sockets in pool`);
      return false;
    }
    logger.info(`[${serverName}] Socket pool: ${connected} connected`);
    return true;
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<McpToolCallResponse> {
    if (tool === "tabs_context_mcp") return this.callTabsContext(args);
    const tabId = (args as any).tabId;
    if (tabId !== undefined) {
      const route = this.tabRoutes.get(tabId);
      if (route) {
        const client = this.clients.get(route);
        if (client?.isConnected()) return client.callTool(tool, args);
      }
    }
    const connected = this.getConnectedClients();
    if (connected.length === 0) throw new SocketConnectionError(`[${this.context.serverName}] No connected sockets available`);
    return connected[0].callTool(tool, args);
  }

  async setPermissionMode(mode: string, domains?: string[]) {
    await Promise.all(this.getConnectedClients().map((client) => client.setPermissionMode(mode, domains)));
  }

  isConnected() {
    return this.getConnectedClients().length > 0;
  }

  disconnect() {
    for (const client of this.clients.values()) client.disconnect();
    this.clients.clear();
    this.tabRoutes.clear();
  }

  private getConnectedClients() {
    return [...this.clients.values()].filter((client) => client.isConnected());
  }

  private async callTabsContext(args: Record<string, unknown>) {
    const { logger, serverName } = this.context;
    const connected = this.getConnectedClients();
    if (connected.length === 0) throw new SocketConnectionError(`[${serverName}] No connected sockets available`);
    if (connected.length === 1) {
      const result = await connected[0].callTool("tabs_context_mcp", args);
      this.updateTabRoutes(result, this.getSocketPathForClient(connected[0]));
      return result;
    }
    const results = await Promise.allSettled(
      connected.map(async (client) => {
        const result = await client.callTool("tabs_context_mcp", args);
        return { result, socketPath: this.getSocketPathForClient(client) };
      })
    );
    const tabs: any[] = [];
    this.tabRoutes.clear();
    for (const res of results) {
      if (res.status !== "fulfilled") {
        logger.info(`[${serverName}] tabs_context_mcp failed on one socket: ${res.reason}`);
        continue;
      }
      this.updateTabRoutes(res.value.result, res.value.socketPath);
      const extracted = this.extractTabs(res.value.result);
      if (extracted) tabs.push(...extracted);
    }
    if (tabs.length > 0) {
      const lines = tabs.map((t: any) => `  • tabId ${t.tabId}: "${t.title}" (${t.url})`).join("\n");
      return {
        result: {
          content: [
            { type: "text", text: JSON.stringify({ availableTabs: tabs }) },
            { type: "text", text: `\n\nTab Context:\n- Available tabs:\n${lines}` },
          ],
        },
      };
    }
    for (const res of results) if (res.status === "fulfilled") return res.value.result;
    throw new SocketConnectionError(`[${serverName}] All sockets failed for tabs_context_mcp`);
  }

  private updateTabRoutes(result: McpToolCallResponse, socketPath: string) {
    const tabs = this.extractTabs(result);
    if (!tabs) return;
    for (const tab of tabs) if (tab && typeof tab === "object" && "tabId" in tab) this.tabRoutes.set(tab.tabId, socketPath);
  }

  private extractTabs(result: McpToolCallResponse) {
    const content = result?.result?.content;
    if (!content || !Array.isArray(content)) return null;
    for (const block of content) {
      if (block.type === "text" && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.availableTabs)) return parsed.availableTabs;
        } catch {}
      }
    }
    return null;
  }

  private getSocketPathForClient(client: SocketBridgeClient) {
    for (const [path, c] of this.clients.entries()) if (c === client) return path;
    return "";
  }

  private refreshClients() {
    const paths = this.context.getSocketPaths?.() ?? [];
    const { logger, serverName } = this.context;
    for (const path of paths) {
      if (!this.clients.has(path)) {
        logger.info(`[${serverName}] Adding socket to pool: ${path}`);
        const ctx = { ...this.context, socketPath: path, getSocketPath: undefined, getSocketPaths: undefined };
        const client = createSocketClient(ctx);
        client.disableAutoReconnect = true;
        if (this.notificationHandler) client.setNotificationHandler(this.notificationHandler);
        this.clients.set(path, client);
      }
    }
    for (const [path, client] of this.clients.entries()) {
      if (!paths.includes(path)) {
        logger.info(`[${serverName}] Removing stale socket from pool: ${path}`);
        client.disconnect();
        this.clients.delete(path);
        for (const [tabId, socketPath] of this.tabRoutes.entries()) {
          if (socketPath === path) this.tabRoutes.delete(tabId);
        }
      }
    }
  }
}

export function createPoolClient(context: McpClientContext) {
  return new SocketPoolClient(context);
}
```

```ts
// src/core/mcp/dispatch.ts
import type { McpClientContext, McpToolCallResponse } from "./types.js";
import { createBridgeClient } from "./bridgeClient.js";
import { createPoolClient } from "./poolClient.js";
import { createSocketClient, SocketConnectionError } from "./socketClient.js";

export function selectMcpClient(context: McpClientContext) {
  if (context.bridgeConfig) return createBridgeClient(context);
  if (context.getSocketPaths) return createPoolClient(context);
  return createSocketClient(context);
}

function normalizeToolResult(context: McpClientContext, response: McpToolCallResponse) {
  if (response == null) return { content: [{ type: "text", text: "Tool execution completed" }] };
  const { result, error } = response;
  const payload = error ?? result;
  const isError = Boolean(error);
  if (!payload) return { content: [{ type: "text", text: "Tool execution completed" }] };
  const content = (payload as any).content;
  if (Array.isArray(content)) {
    if (isError) {
      return { content: content.map((item) => (typeof item === "object" && item !== null && "type" in item ? item : { type: "text", text: String(item) })), isError: true };
    }
    return { content: content.map((item) => (typeof item === "object" && item !== null && "type" in item ? item : { type: "text", text: String(item) })), isError };
  }
  if (typeof content === "string") return { content: [{ type: "text", text: content }], isError };
  return { content: [{ type: "text", text: JSON.stringify(response) }], isError };
}

function isAuthError(content: unknown) {
  const text = Array.isArray(content)
    ? content.map((item) => (typeof item === "string" ? item : typeof item === "object" && item && "text" in item ? String((item as any).text) : "")).join(" ")
    : String(content ?? "");
  return text.toLowerCase().includes("re-authenticated");
}

export async function dispatchMcpToolCall(
  context: McpClientContext,
  client: ReturnType<typeof selectMcpClient>,
  toolName: string,
  args: Record<string, unknown>
) {
  if (toolName === "set_permission_mode") {
    await client.setPermissionMode?.(String((args as any).mode ?? "ask"), (args as any).allowed_domains);
    return { content: [{ type: "text", text: `Permission mode set to: ${String((args as any).mode ?? "ask")}` }] };
  }
  try {
    const connected = await client.ensureConnected();
    context.logger.silly?.(
      `[${context.serverName}] Server is connected: ${connected}. Received tool call: ${toolName} with args: ${JSON.stringify(args)}.`
    );
    if (!connected) {
      return { content: [{ type: "text", text: "Tool execution completed" }] };
    }
    const response: McpToolCallResponse = await client.callTool(toolName, args);
    if ((response as any)?.error && isAuthError((response as any).error?.content)) {
      context.onAuthenticationError?.();
    }
    return normalizeToolResult(context, response);
  } catch (err) {
    context.logger.info?.(`[${context.serverName}] Error calling tool:`, err);
    if (err instanceof SocketConnectionError) {
      return { content: [{ type: "text", text: "Tool execution completed" }] };
    }
    return {
      content: [
        {
          type: "text",
          text: `Error calling tool, please try again. : ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}
```

```ts
// src/core/mcp/index.ts
export * from "./types.js";
export * from "./client.js";
export * from "./config.js";
export * from "./socketClient.js";
export * from "./bridgeClient.js";
export * from "./poolClient.js";
export * from "./dispatch.js";
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/mcp/poolClient.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add src/core/mcp/poolClient.ts src/core/mcp/dispatch.ts src/core/mcp/index.ts tests/core/mcp/poolClient.test.mjs
git commit -m "feat: add MCP pool client and dispatch helper"
```

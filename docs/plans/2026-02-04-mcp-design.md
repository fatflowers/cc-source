# MCP System Design

**Goal:** Restore MCP system behavior (socket bridge, WebSocket bridge, pooling, tool call dispatch) in TypeScript without wiring into `runCli`.

**Scope:** Implement MCP client/transport classes and supporting types under `src/core/mcp/`, mirroring compiled `cli.js` behavior.

**Architecture:**
- Add transport clients:
  - Socket bridge client (net socket, length‑prefixed JSON)
  - WebSocket bridge client (OAuth/dev user id connect + tool_call)
- Add socket pool client to manage multiple local socket paths and route `tabs_context_mcp` by tabId.
- Add tool dispatch helper to normalize results and handle permission mode updates.
- Expand `src/core/mcp/types.ts` with context, logger, and response shapes.
- Export new modules via `src/core/mcp/index.ts`.

**Data Flow:**
1. Tool call → ensure connected (with reconnect/backoff).
2. Transport call → receive tool response.
3. Normalize response to tool result blocks (strings, arrays, images).
4. For tabs context, merge available tabs into a single response.

**Behavioral Notes:**
- Socket client: 4‑byte LE length‑prefixed JSON messages.
- WebSocket client: connect handshake, `tool_call` with permission mode, handle `tool_result`.
- Pooling: refresh available sockets, route by tabId if present.
- Errors: surface as error tool results; auth errors trigger callback.

**Non‑Goals:**
- No tests or compilation checks (per user instruction).
- No integration into CLI pipeline yet.

**Files (planned):**
- Create: `src/core/mcp/socketClient.ts`
- Create: `src/core/mcp/bridgeClient.ts`
- Create: `src/core/mcp/poolClient.ts`
- Create: `src/core/mcp/dispatch.ts`
- Modify: `src/core/mcp/types.ts`
- Modify: `src/core/mcp/index.ts`

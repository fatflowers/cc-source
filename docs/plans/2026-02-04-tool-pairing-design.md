# Tool Pairing & Hook Reordering Design

**Goal:** Restore 1:1 tool-use/tool-result pairing and hook/attachment ordering logic from `cli.js` as a standalone TypeScript module.

**Scope:** Implement pure functions for normalization, pairing, ordering, and context derivation under `src/core/conversation/`. No runtime wiring into `runCli` yet.

**Architecture:**
- Add `src/core/conversation/toolPairing.ts` with pure, deterministic functions that accept arrays of conversation entries and return reordered/filtered arrays and derived maps.
- Expand `src/core/conversation/types.ts` to include missing entry types (`attachment`, `progress`, `system`) and optional fields used by the pairing logic, while keeping backward compatibility with existing callers.
- Export the new module from `src/core/conversation/index.ts` for later integration.

**Data Flow:**
1. `splitMessageBlocks(entries)` normalizes multi-content user/assistant messages into single-content entries, cloning metadata and generating UUIDs when needed.
2. `getToolUseId(entry)` extracts tool-use IDs consistently across assistant tool_use, user tool_result, attachment/progress entries, and informational system messages.
3. `reorderToolUseAndHookMessages(entries)` replays tool_use/tool_result plus hook attachments/progress in the exact order derived from `cli.js`, while preserving tail messages and api_error system messages.
4. `buildToolContext(entries)` produces helper maps such as `progressMessagesByToolUseID`, `siblingToolUseIDs`, and hook resolution counts to support downstream logic.
5. `removeOrphanToolUses(entries)` filters assistant tool_use messages that lack tool_result, matching compiled behavior.

**Error Handling:**
- Preserve malformed/unknown entries unless the compiled logic explicitly filters them.
- Avoid throwing; the intent is behavioral parity rather than new validation.

**Non-Goals:**
- No tests or compilation enforcement (per user instruction).
- No integration into CLI execution yet.

**Files:**
- Create: `src/core/conversation/toolPairing.ts`
- Modify: `src/core/conversation/types.ts`
- Modify: `src/core/conversation/index.ts`

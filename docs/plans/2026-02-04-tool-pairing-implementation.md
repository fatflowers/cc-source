# Tool Pairing & Hook Reordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore cli.js tool-use/tool-result pairing, hook attachment ordering, and tool-context helpers in TypeScript.

**Architecture:** Add a pure `src/core/conversation/toolPairing.ts` module that normalizes message blocks, pairs tool_use/tool_result with hook attachments, and derives helper maps. Expand `src/core/conversation/types.ts` to include attachment/progress/system entries and metadata fields used by the compiled logic. Export the module from `src/core/conversation/index.ts`.

**Tech Stack:** TypeScript (ESM), Node.js for test execution via a lightweight TS loader.

---

### Task 1: Baseline Types + `getToolUseId`

**Files:**
- Create: `scripts/ts-loader.mjs`
- Create: `tests/core/conversation/toolPairing.test.mjs`
- Create: `src/core/conversation/toolPairing.ts`
- Modify: `src/core/conversation/types.ts`

**Step 1: Write the failing test**

```js
// tests/core/conversation/toolPairing.test.mjs
import assert from "node:assert/strict";
import { getToolUseId } from "../../src/core/conversation/toolPairing.ts";

const assistantToolUse = {
  type: "assistant",
  message: { content: [{ type: "tool_use", id: "t1", name: "X", input: {} }] },
};

const userToolResult = {
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "ok" }] },
};

const userWithSource = {
  ...userToolResult,
  sourceToolUseID: "t3",
};

const hookAttachment = {
  type: "attachment",
  attachment: {
    type: "hook_success",
    toolUseID: "t4",
    hookEvent: "PreToolUse",
    hookName: "example",
  },
};

const progressEntry = {
  type: "progress",
  toolUseID: "t5",
  parentToolUseID: "t5",
  data: { type: "hook_progress", hookEvent: "PreToolUse" },
};

const systemInfo = {
  type: "system",
  subtype: "informational",
  toolUseID: "t6",
};

const nonHookAttachment = {
  type: "attachment",
  attachment: { type: "file", toolUseID: "t7" },
};

assert.equal(getToolUseId(assistantToolUse), "t1");
assert.equal(getToolUseId(userToolResult), "t2");
assert.equal(getToolUseId(userWithSource), "t3");
assert.equal(getToolUseId(hookAttachment), "t4");
assert.equal(getToolUseId(progressEntry), "t5");
assert.equal(getToolUseId(systemInfo), "t6");
assert.equal(getToolUseId(nonHookAttachment), null);

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: FAIL with “Cannot find module …/toolPairing.ts” or “getToolUseId is not a function”.

**Step 3: Write minimal implementation**

```js
// scripts/ts-loader.mjs
import ts from "typescript";
import { readFile } from "node:fs/promises";

export async function load(url, context, defaultLoad) {
  if (!url.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }
  const source = await readFile(new URL(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  return { format: "module", source: outputText };
}
```

```ts
// src/core/conversation/types.ts
import type { MessageContent } from "../model/types.js";

export type ConversationRole = "user" | "assistant" | "system";

export type HookAttachmentType =
  | "hook_blocking_error"
  | "hook_cancelled"
  | "hook_error_during_execution"
  | "hook_non_blocking_error"
  | "hook_success"
  | "hook_system_message"
  | "hook_additional_context"
  | "hook_stopped_continuation";

export type HookEvent = "PreToolUse" | "PostToolUse" | string;

export interface ConversationMessage {
  type: ConversationRole;
  uuid?: string;
  timestamp?: string;
  requestId?: string;
  isMeta?: boolean;
  isVisibleInTranscriptOnly?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  mcpMeta?: unknown;
  thinkingMetadata?: unknown;
  todos?: unknown;
  imagePasteIds?: string[];
  sourceToolUseID?: string;
  sourceToolAssistantUUID?: string;
  permissionMode?: string;
  error?: unknown;
  isApiErrorMessage?: boolean;
  message: {
    content: MessageContent;
    role?: ConversationRole;
    id?: string;
    context_management?: unknown;
  };
}

export interface ConversationAttachment {
  type: "attachment";
  uuid?: string;
  timestamp?: string;
  attachment: {
    type: HookAttachmentType | string;
    toolUseID?: string;
    hookEvent?: HookEvent;
    hookName?: string;
    [key: string]: unknown;
  };
}

export interface ConversationProgress {
  type: "progress";
  uuid?: string;
  timestamp?: string;
  toolUseID?: string;
  parentToolUseID?: string;
  data: {
    type: string;
    hookEvent?: HookEvent;
    [key: string]: unknown;
  };
}

export interface ConversationSystem {
  type: "system";
  uuid?: string;
  timestamp?: string;
  isMeta?: boolean;
  subtype?: string;
  toolUseID?: string | null;
  content?: unknown;
  level?: string;
  message?: {
    content?: MessageContent;
    role?: ConversationRole;
  };
  [key: string]: unknown;
}

export type ConversationEntry =
  | ConversationMessage
  | ConversationAttachment
  | ConversationProgress
  | ConversationSystem;

export interface ApiMessageParam {
  role: "user" | "assistant";
  content: MessageContent;
}
```

```ts
// src/core/conversation/toolPairing.ts
import type { ConversationEntry, ConversationAttachment } from "./types.js";

const HOOK_ATTACHMENT_TYPES = new Set([
  "hook_blocking_error",
  "hook_cancelled",
  "hook_error_during_execution",
  "hook_non_blocking_error",
  "hook_success",
  "hook_system_message",
  "hook_additional_context",
  "hook_stopped_continuation",
]);

export function isHookAttachment(entry: ConversationEntry): entry is ConversationAttachment {
  return (
    entry.type === "attachment" &&
    HOOK_ATTACHMENT_TYPES.has(entry.attachment.type)
  );
}

export function getToolUseId(entry: ConversationEntry): string | null {
  switch (entry.type) {
    case "attachment":
      return isHookAttachment(entry) ? entry.attachment.toolUseID ?? null : null;
    case "assistant": {
      const first = Array.isArray(entry.message.content) ? entry.message.content[0] : undefined;
      return first && first.type === "tool_use" ? first.id : null;
    }
    case "user": {
      if (entry.sourceToolUseID) return entry.sourceToolUseID;
      const first = Array.isArray(entry.message.content) ? entry.message.content[0] : undefined;
      return first && first.type === "tool_result" ? first.tool_use_id : null;
    }
    case "progress":
      return entry.toolUseID ?? null;
    case "system":
      return entry.subtype === "informational" ? (entry.toolUseID ?? null) : null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs src/core/conversation/types.ts src/core/conversation/toolPairing.ts
git commit -m "feat: add conversation entry types and getToolUseId"
```

---

### Task 2: Message Normalization (`splitMessageBlocks`)

**Files:**
- Modify: `tests/core/conversation/toolPairing.test.mjs`
- Modify: `src/core/conversation/toolPairing.ts`

**Step 1: Write the failing test**

```js
// Append to tests/core/conversation/toolPairing.test.mjs
import { splitMessageBlocks } from "../../src/core/conversation/toolPairing.ts";

const multiAssistant = {
  type: "assistant",
  uuid: "a1",
  timestamp: "2020-01-01T00:00:00.000Z",
  message: {
    id: "msg-1",
    content: [
      { type: "text", text: "hello" },
      { type: "tool_use", id: "tool-1", name: "X", input: {} },
    ],
  },
};

const multiUser = {
  type: "user",
  uuid: "u1",
  timestamp: "2020-01-01T00:00:00.000Z",
  message: {
    role: "user",
    content: [
      { type: "text", text: "hi" },
      { type: "image", source: { type: "base64", data: "abc" } },
    ],
  },
  imagePasteIds: ["img-1"],
};

const normalized = splitMessageBlocks([multiAssistant, multiUser]);
assert.equal(normalized.length, 4);
assert.equal(normalized[0].type, "assistant");
assert.equal(normalized[0].message.content.length, 1);
assert.equal(normalized[1].type, "assistant");
assert.equal(normalized[1].message.content[0].type, "tool_use");
assert.equal(normalized[2].type, "user");
assert.equal(normalized[2].message.content[0].type, "text");
assert.equal(normalized[3].type, "user");
assert.equal(normalized[3].message.content[0].type, "image");
assert.deepEqual(normalized[3].imagePasteIds, ["img-1"]);
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: FAIL with “splitMessageBlocks is not a function”.

**Step 3: Write minimal implementation**

```ts
// Append to src/core/conversation/toolPairing.ts
import type { ConversationMessage, ConversationEntry, ConversationAttachment } from "./types.js";
import type { ContentBlock } from "../model/types.js";
import { randomUUID } from "node:crypto";

const NO_CONTENT_TEXT = "(no content)";
const DEFAULT_USER_CONTENT: ContentBlock[] = [{ type: "text", text: NO_CONTENT_TEXT }];

function createUuid(): string {
  return typeof randomUUID === "function" ? randomUUID() : `${Date.now()}-${Math.random()}`;
}

function createUserMessage(params: {
  content?: ContentBlock[];
  isMeta?: boolean;
  isVisibleInTranscriptOnly?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  mcpMeta?: unknown;
  uuid?: string;
  thinkingMetadata?: unknown;
  timestamp?: string;
  todos?: unknown;
  imagePasteIds?: string[];
  sourceToolAssistantUUID?: string;
  permissionMode?: string;
}): ConversationMessage {
  return {
    type: "user",
    message: { role: "user", content: params.content ?? DEFAULT_USER_CONTENT },
    isMeta: params.isMeta,
    isVisibleInTranscriptOnly: params.isVisibleInTranscriptOnly,
    isCompactSummary: params.isCompactSummary,
    uuid: params.uuid ?? createUuid(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    toolUseResult: params.toolUseResult,
    mcpMeta: params.mcpMeta,
    thinkingMetadata: params.thinkingMetadata,
    todos: params.todos,
    imagePasteIds: params.imagePasteIds,
    sourceToolAssistantUUID: params.sourceToolAssistantUUID,
    permissionMode: params.permissionMode,
  };
}

export function splitMessageBlocks(entries: ConversationEntry[]): ConversationEntry[] {
  let sawMultipleBlocks = false;
  return entries.flatMap((entry) => {
    switch (entry.type) {
      case "assistant": {
        if (!Array.isArray(entry.message.content)) return [entry];
        sawMultipleBlocks = sawMultipleBlocks || entry.message.content.length > 1;
        return entry.message.content.map((block) => {
          const uuid = sawMultipleBlocks ? createUuid() : entry.uuid;
          return {
            type: "assistant",
            timestamp: entry.timestamp,
            message: {
              ...entry.message,
              content: [block],
              context_management: entry.message.context_management ?? null,
            },
            isMeta: entry.isMeta,
            requestId: entry.requestId,
            uuid,
            error: entry.error,
            isApiErrorMessage: entry.isApiErrorMessage,
          };
        });
      }
      case "attachment":
      case "progress":
      case "system":
        return [entry];
      case "user": {
        if (typeof entry.message.content === "string") {
          const uuid = sawMultipleBlocks ? createUuid() : entry.uuid;
          return [
            {
              ...entry,
              uuid,
              message: {
                ...entry.message,
                content: [{ type: "text", text: entry.message.content }],
              },
            },
          ];
        }
        if (!Array.isArray(entry.message.content)) return [entry];
        sawMultipleBlocks = sawMultipleBlocks || entry.message.content.length > 1;
        let imageIndex = 0;
        return entry.message.content.map((block) => {
          const isImage = block.type === "image";
          const imagePasteId = isImage && entry.imagePasteIds ? entry.imagePasteIds[imageIndex] : undefined;
          if (isImage) imageIndex += 1;
          const next = createUserMessage({
            content: [block],
            toolUseResult: entry.toolUseResult,
            mcpMeta: entry.mcpMeta,
            isMeta: entry.isMeta,
            isVisibleInTranscriptOnly: entry.isVisibleInTranscriptOnly,
            timestamp: entry.timestamp,
            imagePasteIds: imagePasteId !== undefined ? [imagePasteId] : undefined,
          });
          return { ...next, uuid: sawMultipleBlocks ? createUuid() : entry.uuid };
        });
      }
    }
  });
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add tests/core/conversation/toolPairing.test.mjs src/core/conversation/toolPairing.ts
git commit -m "feat: add splitMessageBlocks normalization"
```

---

### Task 3: Tool/Hook Reordering + Context Helpers

**Files:**
- Modify: `tests/core/conversation/toolPairing.test.mjs`
- Modify: `src/core/conversation/toolPairing.ts`

**Step 1: Write the failing test**

```js
// Append to tests/core/conversation/toolPairing.test.mjs
import {
  isAssistantToolUse,
  isUserToolResult,
  reorderToolUseAndHookMessages,
  buildToolContext,
  getSiblingToolUseIds,
  getProgressMessagesForEntry,
  hasInProgressHooks,
  getToolUseIds,
  getErrorToolUseIds,
  missingToolResultIds,
  removeOrphanToolUses,
  attachAttachmentsToNeighbors,
} from "../../src/core/conversation/toolPairing.ts";

const toolUse = {
  type: "assistant",
  message: { id: "m1", content: [{ type: "tool_use", id: "tu1", name: "X", input: {} }] },
};
const preHook = {
  type: "attachment",
  attachment: { type: "hook_success", toolUseID: "tu1", hookEvent: "PreToolUse", hookName: "h1" },
};
const postHook = {
  type: "attachment",
  attachment: { type: "hook_success", toolUseID: "tu1", hookEvent: "PostToolUse", hookName: "h1" },
};
const toolResult = {
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "ok" }] },
};
const apiError = {
  type: "system",
  subtype: "api_error",
  level: "error",
};

const reordered = reorderToolUseAndHookMessages([preHook, toolResult, toolUse, postHook, apiError], []);
assert.equal(reordered[0].type, "assistant");
assert.equal(reordered[1].type, "attachment");
assert.equal(reordered[2].type, "user");
assert.equal(reordered[3].type, "attachment");

assert.equal(isAssistantToolUse(toolUse), true);
assert.equal(isUserToolResult(toolResult), true);

const ctx = buildToolContext([preHook], [toolUse]);
assert.deepEqual(getSiblingToolUseIds(toolUse, ctx), new Set(["tu1"]));
assert.deepEqual(getProgressMessagesForEntry(toolUse, ctx), []);
assert.equal(hasInProgressHooks("tu1", "PreToolUse", ctx), false);

assert.deepEqual(getToolUseIds([toolUse]), new Set(["tu1"]));
assert.deepEqual(getErrorToolUseIds([toolUse, toolResult]), new Set());
assert.deepEqual(missingToolResultIds([toolUse]), new Set(["tu1"]));

const removed = removeOrphanToolUses([toolUse]);
assert.equal(removed.length, 0);

const attached = attachAttachmentsToNeighbors([toolUse, preHook]);
assert.equal(attached[1].type, "attachment");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: FAIL with “reorderToolUseAndHookMessages is not a function”.

**Step 3: Write minimal implementation**

```ts
// Append to src/core/conversation/toolPairing.ts
import type { ConversationEntry, ConversationMessage, ConversationProgress } from "./types.js";

export function isAssistantToolUse(entry: ConversationEntry): boolean {
  return entry.type === "assistant" && entry.message.content.some((block) => block.type === "tool_use");
}

export function isUserToolResult(entry: ConversationEntry): boolean {
  return (
    entry.type === "user" &&
    ((Array.isArray(entry.message.content) && entry.message.content[0]?.type === "tool_result") ||
      Boolean(entry.toolUseResult))
  );
}

export function reorderToolUseAndHookMessages(entries: ConversationEntry[], tail: ConversationEntry[]): ConversationEntry[] {
  const grouped = new Map<
    string,
    { toolUse: ConversationEntry | null; preHooks: ConversationEntry[]; toolResult: ConversationEntry | null; postHooks: ConversationEntry[] }
  >();

  for (const entry of entries) {
    if (isAssistantToolUse(entry)) {
      const id = entry.message.content[0]?.id;
      if (id) {
        if (!grouped.has(id)) grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
        grouped.get(id)!.toolUse = entry;
      }
      continue;
    }
    if (isHookAttachment(entry) && entry.attachment.hookEvent === "PreToolUse") {
      const id = entry.attachment.toolUseID;
      if (!id) continue;
      if (!grouped.has(id)) grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      grouped.get(id)!.preHooks.push(entry);
      continue;
    }
    if (entry.type === "user" && entry.message.content[0]?.type === "tool_result") {
      const id = entry.message.content[0].tool_use_id;
      if (!grouped.has(id)) grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      grouped.get(id)!.toolResult = entry;
      continue;
    }
    if (isHookAttachment(entry) && entry.attachment.hookEvent === "PostToolUse") {
      const id = entry.attachment.toolUseID;
      if (!id) continue;
      if (!grouped.has(id)) grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      grouped.get(id)!.postHooks.push(entry);
    }
  }

  const output: ConversationEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (isAssistantToolUse(entry)) {
      const id = entry.message.content[0]?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        const group = grouped.get(id);
        if (group?.toolUse) {
          output.push(group.toolUse, ...group.preHooks);
          if (group.toolResult) output.push(group.toolResult);
          output.push(...group.postHooks);
        }
      }
      continue;
    }
    if (isHookAttachment(entry) && (entry.attachment.hookEvent === "PreToolUse" || entry.attachment.hookEvent === "PostToolUse")) {
      continue;
    }
    if (entry.type === "user" && entry.message.content[0]?.type === "tool_result") {
      continue;
    }
    if (entry.type === "system" && entry.subtype === "api_error") {
      const last = output.at(-1);
      if (last?.type === "system" && last.subtype === "api_error") {
        output[output.length - 1] = entry;
      } else {
        output.push(entry);
      }
      continue;
    }
    output.push(entry);
  }

  for (const entry of tail) output.push(entry);
  const last = output.at(-1);
  return output.filter((entry) => entry.type !== "system" || entry.subtype !== "api_error" || entry === last);
}

export function countProgressByHookEvent(entries: ConversationEntry[], toolUseID: string, hookEvent: string): number {
  return entries.filter(
    (entry) =>
      entry.type === "progress" &&
      entry.data.type === "hook_progress" &&
      entry.data.hookEvent === hookEvent &&
      entry.parentToolUseID === toolUseID
  ).length;
}

export function countResolvedHooks(entries: ConversationEntry[], toolUseID: string, hookEvent: string): number {
  return new Set(
    entries
      .filter((entry) => isHookAttachment(entry) && entry.attachment.toolUseID === toolUseID && entry.attachment.hookEvent === hookEvent)
      .map((entry) => entry.attachment.hookName)
  ).size;
}

export function toolResultErrorMap(entries: ConversationEntry[]): Record<string, boolean> {
  return Object.fromEntries(
    entries.flatMap((entry) =>
      entry.type === "user" && entry.message.content[0]?.type === "tool_result"
        ? [[entry.message.content[0].tool_use_id, entry.message.content[0].is_error ?? false]]
        : []
    )
  );
}

export function buildToolContext(entries: ConversationEntry[], messages: ConversationEntry[]) {
  const toolUsesByMessageId = new Map<string | undefined, Set<string>>();
  const toolUseToMessageId = new Map<string, string | undefined>();
  for (const entry of messages) {
    if (entry.type !== "assistant") continue;
    const messageId = entry.message.id;
    let set = toolUsesByMessageId.get(messageId);
    if (!set) {
      set = new Set();
      toolUsesByMessageId.set(messageId, set);
    }
    for (const block of entry.message.content) {
      if (block.type === "tool_use") {
        set.add(block.id);
        toolUseToMessageId.set(block.id, messageId);
      }
    }
  }
  const siblingToolUseIDs = new Map<string, Set<string> | undefined>();
  for (const [toolUseId, messageId] of toolUseToMessageId) {
    siblingToolUseIDs.set(toolUseId, toolUsesByMessageId.get(messageId));
  }

  const progressMessagesByToolUseID = new Map<string | undefined, ConversationProgress[]>();
  const inProgressHookCounts = new Map<string | undefined, Map<string, number>>();
  const resolvedHookCounts = new Map<string | undefined, Map<string, number>>();

  for (const entry of entries) {
    if (entry.type === "progress") {
      const parentId = entry.parentToolUseID;
      const list = progressMessagesByToolUseID.get(parentId);
      if (list) list.push(entry);
      else progressMessagesByToolUseID.set(parentId, [entry]);
      if (entry.data.type === "hook_progress") {
        const hookEvent = entry.data.hookEvent;
        if (!hookEvent) continue;
        const map = inProgressHookCounts.get(parentId) ?? new Map<string, number>();
        map.set(hookEvent, (map.get(hookEvent) ?? 0) + 1);
        inProgressHookCounts.set(parentId, map);
      }
    }
    if (isHookAttachment(entry)) {
      const toolUseId = entry.attachment.toolUseID;
      const hookEvent = entry.attachment.hookEvent;
      const map = resolvedHookCounts.get(toolUseId) ?? new Map<string, number>();
      if (hookEvent) map.set(hookEvent, (map.get(hookEvent) ?? 0) + 1);
      resolvedHookCounts.set(toolUseId, map);
    }
  }

  return { siblingToolUseIDs, progressMessagesByToolUseID, inProgressHookCounts, resolvedHookCounts };
}

export function getSiblingToolUseIds(entry: ConversationEntry, ctx: ReturnType<typeof buildToolContext>): Set<string> {
  const id = getToolUseId(entry);
  if (!id) return new Set();
  return ctx.siblingToolUseIDs.get(id) ?? new Set();
}

export function getProgressMessagesForEntry(entry: ConversationEntry, ctx: ReturnType<typeof buildToolContext>): ConversationProgress[] {
  const id = getToolUseId(entry);
  if (!id) return [];
  return ctx.progressMessagesByToolUseID.get(id) ?? [];
}

export function hasInProgressHooks(toolUseId: string, hookEvent: string, ctx: ReturnType<typeof buildToolContext>): boolean {
  const inProgress = ctx.inProgressHookCounts.get(toolUseId)?.get(hookEvent) ?? 0;
  const resolved = ctx.resolvedHookCounts.get(toolUseId)?.get(hookEvent) ?? 0;
  return inProgress > resolved;
}

export function setDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const value of left) if (!right.has(value)) out.add(value);
  return out;
}

export function getToolUseIds(entries: ConversationEntry[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.type === "assistant" && Array.isArray(entry.message.content) && entry.message.content[0]?.type === "tool_use")
      .map((entry) => entry.message.content[0].id)
  );
}

export function getErrorToolUseIds(entries: ConversationEntry[]): Set<string> {
  const errorMap = toolResultErrorMap(entries);
  return new Set(
    entries
      .filter(
        (entry) =>
          entry.type === "assistant" &&
          Array.isArray(entry.message.content) &&
          entry.message.content[0]?.type === "tool_use" &&
          entry.message.content[0]?.id in errorMap &&
          errorMap[entry.message.content[0].id] === true
      )
      .map((entry) => entry.message.content[0].id)
  );
}

export function missingToolResultIds(entries: ConversationEntry[]): Set<string> {
  const errorMap = toolResultErrorMap(entries);
  const toolUseIds = getToolUseIds(entries);
  return setDifference(toolUseIds, new Set(Object.keys(errorMap)));
}

export function attachAttachmentsToNeighbors(entries: ConversationEntry[]): ConversationEntry[] {
  const output: ConversationEntry[] = [];
  const pending: ConversationEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.type === "attachment") {
      pending.unshift(entry);
      continue;
    }
    const isToolAnchor =
      entry.type === "assistant" ||
      (entry.type === "user" &&
        Array.isArray(entry.message.content) &&
        entry.message.content[0]?.type === "tool_result");
    if (isToolAnchor && pending.length > 0) {
      output.unshift(entry, ...pending);
      pending.length = 0;
    } else {
      output.unshift(entry);
    }
  }
  output.unshift(...pending);
  return output;
}

export function removeOrphanToolUses(entries: ConversationEntry[]): ConversationEntry[] {
  const normalized = splitMessageBlocks(entries);
  const missing = missingToolResultIds(normalized);
  return normalized.filter((entry) => {
    if (
      entry.type === "assistant" &&
      entry.message.content[0]?.type === "tool_use" &&
      missing.has(entry.message.content[0].id)
    ) {
      return false;
    }
    return true;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/conversation/toolPairing.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add tests/core/conversation/toolPairing.test.mjs src/core/conversation/toolPairing.ts
git commit -m "feat: restore tool pairing and hook ordering helpers"
```

---

### Task 4: Export Module

**Files:**
- Modify: `src/core/conversation/index.ts`

**Step 1: Update exports**

```ts
// src/core/conversation/index.ts
export * from "./types.js";
export * from "./cache.js";
export * from "./messages.js";
export * from "./toolPairing.js";
```

**Step 2: Quick smoke check**

Run: `node --loader ./scripts/ts-loader.mjs -e "import { getToolUseId } from './src/core/conversation/toolPairing.ts'; console.log(typeof getToolUseId)"`
Expected: prints `function`.

**Step 3: Commit**

```bash
git add src/core/conversation/index.ts
git commit -m "feat: export conversation tool pairing utilities"
```

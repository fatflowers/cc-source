import { randomUUID } from "node:crypto";
import type { ContentBlock, MessageContent } from "../model/types.js";
import type {
  ConversationAttachment,
  ConversationEntry,
  ConversationMessage,
  ConversationProgress,
} from "./types.js";

const NO_CONTENT_TEXT = "(no content)";
const DEFAULT_USER_CONTENT: MessageContent = NO_CONTENT_TEXT;

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

function createUuid(): string {
  if (typeof randomUUID === "function") return randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createUserMessage(params: {
  content?: MessageContent;
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
    message: {
      role: "user",
      content: params.content ?? DEFAULT_USER_CONTENT,
    },
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

export function isHookAttachment(entry: ConversationEntry): entry is ConversationAttachment {
  return (
    entry.type === "attachment" &&
    HOOK_ATTACHMENT_TYPES.has(entry.attachment.type)
  );
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
          const imagePasteId =
            isImage && entry.imagePasteIds ? entry.imagePasteIds[imageIndex] : undefined;
          if (isImage) imageIndex += 1;
          const next = createUserMessage({
            content: [block as ContentBlock],
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

export function isAssistantToolUse(entry: ConversationEntry): boolean {
  return (
    entry.type === "assistant" &&
    Array.isArray(entry.message.content) &&
    entry.message.content.some((block) => block.type === "tool_use")
  );
}

export function isUserToolResult(entry: ConversationEntry): boolean {
  return (
    entry.type === "user" &&
    ((Array.isArray(entry.message.content) &&
      entry.message.content[0]?.type === "tool_result") ||
      Boolean(entry.toolUseResult))
  );
}

export function reorderToolUseAndHookMessages(
  entries: ConversationEntry[],
  tail: ConversationEntry[]
): ConversationEntry[] {
  const grouped = new Map<
    string,
    {
      toolUse: ConversationEntry | null;
      preHooks: ConversationEntry[];
      toolResult: ConversationEntry | null;
      postHooks: ConversationEntry[];
    }
  >();

  for (const entry of entries) {
    if (isAssistantToolUse(entry)) {
      const id = entry.message.content[0]?.id;
      if (id) {
        if (!grouped.has(id)) {
          grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
        }
        grouped.get(id)!.toolUse = entry;
      }
      continue;
    }
    if (isHookAttachment(entry) && entry.attachment.hookEvent === "PreToolUse") {
      const id = entry.attachment.toolUseID;
      if (!id) continue;
      if (!grouped.has(id)) {
        grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      }
      grouped.get(id)!.preHooks.push(entry);
      continue;
    }
    if (entry.type === "user" && entry.message.content[0]?.type === "tool_result") {
      const id = entry.message.content[0].tool_use_id;
      if (!grouped.has(id)) {
        grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      }
      grouped.get(id)!.toolResult = entry;
      continue;
    }
    if (isHookAttachment(entry) && entry.attachment.hookEvent === "PostToolUse") {
      const id = entry.attachment.toolUseID;
      if (!id) continue;
      if (!grouped.has(id)) {
        grouped.set(id, { toolUse: null, preHooks: [], toolResult: null, postHooks: [] });
      }
      grouped.get(id)!.postHooks.push(entry);
      continue;
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
          output.push(group.toolUse);
          output.push(...group.preHooks);
          if (group.toolResult) output.push(group.toolResult);
          output.push(...group.postHooks);
        }
      }
      continue;
    }
    if (
      isHookAttachment(entry) &&
      (entry.attachment.hookEvent === "PreToolUse" ||
        entry.attachment.hookEvent === "PostToolUse")
    ) {
      continue;
    }
    if (entry.type === "user" && entry.message.content[0]?.type === "tool_result") {
      continue;
    }
    if (entry.type === "system" && entry.subtype === "api_error") {
      const last = output[output.length - 1];
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
  const last = output[output.length - 1];
  return output.filter(
    (entry) => entry.type !== "system" || entry.subtype !== "api_error" || entry === last
  );
}

export function countHookProgressEntries(
  entries: ConversationEntry[],
  toolUseID: string,
  hookEvent: string
): number {
  return entries.filter(
    (entry) =>
      entry.type === "progress" &&
      entry.data.type === "hook_progress" &&
      entry.data.hookEvent === hookEvent &&
      entry.parentToolUseID === toolUseID
  ).length;
}

export function countResolvedHooks(
  entries: ConversationEntry[],
  toolUseID: string,
  hookEvent: string
): number {
  return new Set(
    entries
      .filter(
        (entry) =>
          isHookAttachment(entry) &&
          entry.attachment.toolUseID === toolUseID &&
          entry.attachment.hookEvent === hookEvent
      )
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

  return {
    siblingToolUseIDs,
    progressMessagesByToolUseID,
    inProgressHookCounts,
    resolvedHookCounts,
  };
}

export function getSiblingToolUseIds(
  entry: ConversationEntry,
  ctx: ReturnType<typeof buildToolContext>
): Set<string> {
  const id = getToolUseId(entry);
  if (!id) return new Set();
  return ctx.siblingToolUseIDs.get(id) ?? new Set();
}

export function getProgressMessagesForEntry(
  entry: ConversationEntry,
  ctx: ReturnType<typeof buildToolContext>
): ConversationProgress[] {
  const id = getToolUseId(entry);
  if (!id) return [];
  return ctx.progressMessagesByToolUseID.get(id) ?? [];
}

export function hasInProgressHooks(
  toolUseId: string,
  hookEvent: string,
  ctx: ReturnType<typeof buildToolContext>
): boolean {
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
      .filter(
        (entry) =>
          entry.type === "assistant" &&
          Array.isArray(entry.message.content) &&
          entry.message.content[0]?.type === "tool_use"
      )
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
      return entry.subtype === "informational" ? entry.toolUseID ?? null : null;
  }
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

import type { MessageContent } from "../model/types.js";

export type ConversationRole = "user" | "assistant" | "system";

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

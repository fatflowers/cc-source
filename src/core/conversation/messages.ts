import type { MessageContent, ContentBlock } from "../model/types.js";
import type { ConversationMessage, ApiMessageParam } from "./types.js";
import { createCacheControl } from "./cache.js";

function addCacheControlToUserContent(content: MessageContent, cache: boolean): MessageContent {
  if (!cache) return content;
  if (typeof content === "string") {
    return [{ type: "text", text: content, cache_control: createCacheControl() } as ContentBlock];
  }
  return content.map((block, index) => {
    if (index === content.length - 1) {
      return { ...block, cache_control: createCacheControl() } as ContentBlock;
    }
    return block;
  });
}

function addCacheControlToAssistantContent(content: MessageContent, cache: boolean): MessageContent {
  if (!cache) return content;
  if (typeof content === "string") {
    return [{ type: "text", text: content, cache_control: createCacheControl() } as ContentBlock];
  }

  return content.map((block, index) => {
    const isLast = index === content.length - 1;
    if (!isLast) return block;
    if (block.type === "thinking" || block.type === "redacted_thinking") return block;
    return { ...block, cache_control: createCacheControl() } as ContentBlock;
  });
}

export function toApiMessage(message: ConversationMessage, cache: boolean): ApiMessageParam {
  if (message.type === "user") {
    return {
      role: "user",
      content: addCacheControlToUserContent(message.message.content, cache),
    };
  }

  if (message.type === "assistant") {
    return {
      role: "assistant",
      content: addCacheControlToAssistantContent(message.message.content, cache),
    };
  }

  return {
    role: "user",
    content: message.message.content,
  };
}

export function normalizeMessagesForApi(messages: ConversationMessage[], enableCaching: boolean) {
  const startCacheIndex = Math.max(0, messages.length - 3);
  return messages.map((msg, index) => toApiMessage(msg, enableCaching && index >= startCacheIndex));
}

import { callModel } from "../model/request.js";
import type { AnthropicClient, ContentBlock } from "../model/types.js";

export const WEB_SEARCH_TOOL_NAME = "WebSearch";
export const WEB_SEARCH_SERVER_TOOL_TYPE = "web_search_20250305";

export interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface WebSearchHit {
  title: string;
  url: string;
}

export interface WebSearchToolResultEntry {
  tool_use_id: string;
  content: WebSearchHit[];
}

export type WebSearchResults = Array<WebSearchToolResultEntry | string>;

export interface WebSearchOutput {
  query: string;
  results: WebSearchResults;
  durationSeconds: number;
}

export interface WebSearchValidationResult {
  result: boolean;
  message?: string;
  errorCode?: number;
}

export type WebSearchContentBlock =
  | ContentBlock
  | {
      type: "web_search_tool_result";
      tool_use_id: string;
      content: Array<{ title: string; url: string }> | { error_code?: string };
    };

export function validateWebSearchInput(input: WebSearchInput): WebSearchValidationResult {
  if (!input.query || input.query.length === 0) {
    return { result: false, message: "Error: Missing query", errorCode: 1 };
  }
  if (input.allowed_domains?.length && input.blocked_domains?.length) {
    return {
      result: false,
      message: "Error: Cannot specify both allowed_domains and blocked_domains in the same request",
      errorCode: 2,
    };
  }
  return { result: true };
}

export function buildWebSearchServerToolSchema(input: WebSearchInput) {
  return {
    type: WEB_SEARCH_SERVER_TOOL_TYPE,
    name: "web_search",
    allowed_domains: input.allowed_domains,
    blocked_domains: input.blocked_domains,
    max_uses: 8,
  };
}

export function extractWebSearchResults(
  contentBlocks: WebSearchContentBlock[],
  query: string,
  durationSeconds: number
): WebSearchOutput {
  const results: WebSearchResults = [];
  let buffer = "";
  let beforeServerToolUse = true;

  for (const block of contentBlocks) {
    if (block.type === "server_tool_use") {
      if (beforeServerToolUse) {
        beforeServerToolUse = false;
        const trimmed = buffer.trim();
        if (trimmed.length > 0) results.push(trimmed);
        buffer = "";
      }
      continue;
    }

    if (block.type === "web_search_tool_result") {
      if (Array.isArray(block.content)) {
        results.push({
          tool_use_id: block.tool_use_id,
          content: block.content.map((hit) => ({ title: hit.title, url: hit.url })),
        });
      } else {
        const errorCode = (block.content as { error_code?: string }).error_code ?? "unknown";
        results.push(`Web search error: ${errorCode}`);
      }
      continue;
    }

    if (block.type === "text") {
      if (beforeServerToolUse) {
        buffer += block.text;
      } else {
        beforeServerToolUse = true;
        buffer = block.text;
      }
    }
  }

  if (buffer.length > 0) results.push(buffer.trim());

  return { query, results, durationSeconds };
}

export interface RunWebSearchOptions {
  client: AnthropicClient;
  model: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function runWebSearch(
  input: WebSearchInput,
  options: RunWebSearchOptions
): Promise<WebSearchOutput> {
  const validation = validateWebSearchInput(input);
  if (!validation.result) {
    const error = new Error(validation.message ?? "Invalid web search input");
    (error as any).errorCode = validation.errorCode;
    throw error;
  }

  const start = performance.now();
  const toolSchema = buildWebSearchServerToolSchema(input);
  const response = await callModel(options.client, {
    model: options.model,
    max_tokens: options.maxTokens ?? 1024,
    messages: [
      {
        role: "user",
        content: `Perform a web search for the query: ${input.query}`,
      },
    ],
    tools: [toolSchema],
    tool_choice: { type: "tool", name: "web_search" },
    signal: options.signal,
  });

  const contentBlocks = (response?.content ?? []) as WebSearchContentBlock[];
  const durationSeconds = (performance.now() - start) / 1000;
  return extractWebSearchResults(contentBlocks, input.query, durationSeconds);
}

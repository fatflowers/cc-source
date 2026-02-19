import type { McpToolCallInput, McpToolCallResponse, McpToolResult } from "./types.js";

export function normalizeMcpToolCallResponse(response: McpToolCallResponse): McpToolResult {
  if (response.is_error) {
    return { content: response.content ?? response.error?.content ?? response.result?.content ?? response, is_error: true };
  }
  if (response.error) {
    return { content: response.error.content ?? response.error, is_error: true };
  }
  if (response.result) {
    return { content: (response.result as any).content ?? response.result };
  }
  return { content: response.content ?? response };
}

export async function dispatchMcpToolCall(
  call: (input: McpToolCallInput & { serverName?: string; tabId?: string }) => Promise<McpToolCallResponse>,
  input: McpToolCallInput & { serverName?: string; tabId?: string }
): Promise<McpToolResult> {
  const response = await call(input);
  return normalizeMcpToolCallResponse(response);
}

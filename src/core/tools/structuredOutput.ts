import type { ToolContext, ToolDefinition } from "./types.js";

export interface StructuredOutputResult {
  data: string;
  structured_output: unknown;
}

export function createStructuredOutputTool(_context: ToolContext): ToolDefinition<Record<string, unknown>, StructuredOutputResult> {
  return {
    name: "StructuredOutput",
    description: "Return structured output in the requested format.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    async run(input) {
      return {
        data: "Structured output provided successfully",
        structured_output: input,
      };
    },
  };
}

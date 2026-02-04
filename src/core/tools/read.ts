import type { ToolContext, ToolDefinition } from "./types.js";
import { readFileSmart } from "../fs/readers.js";
import type { FileReadResult } from "../fs/types.js";

export interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export function createReadTool(_context: ToolContext): ToolDefinition<ReadInput, FileReadResult> {
  return {
    name: "Read",
    description: "Read a file from the local filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file" },
        offset: { type: "number", description: "Line number to start reading from" },
        limit: { type: "number", description: "Maximum number of lines to read" },
      },
      required: ["file_path"],
    },
    async run(input) {
      return readFileSmart(input.file_path, { offset: input.offset, limit: input.limit });
    },
  };
}

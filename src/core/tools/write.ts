import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface WriteInput {
  file_path: string;
  content: string;
}

export interface WriteResult {
  filePath: string;
  bytesWritten: number;
}

export function createWriteTool(_context: ToolContext): ToolDefinition<WriteInput, WriteResult> {
  return {
    name: "Write",
    description: "Write a file to the local filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "File contents" },
      },
      required: ["file_path", "content"],
    },
    async run(input) {
      await mkdir(dirname(input.file_path), { recursive: true });
      await writeFile(input.file_path, input.content, "utf8");
      return {
        filePath: input.file_path,
        bytesWritten: Buffer.byteLength(input.content),
      };
    },
  };
}

import type { ToolContext, ToolDefinition } from "./types.js";
import { copyPath } from "../fs/ops.js";

export interface CopyInput {
  from: string;
  to: string;
  overwrite?: boolean;
}

export function createCopyTool(_context: ToolContext): ToolDefinition<CopyInput, { success: true }> {
  return {
    name: "Copy",
    description: "Copy a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path" },
        to: { type: "string", description: "Destination path" },
        overwrite: { type: "boolean", description: "Overwrite destination" },
      },
      required: ["from", "to"],
    },
    async run(input) {
      await copyPath(input.from, input.to, { overwrite: input.overwrite });
      return { success: true };
    },
  };
}

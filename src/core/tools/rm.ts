import type { ToolContext, ToolDefinition } from "./types.js";
import { removePath } from "../fs/ops.js";

export interface RmInput {
  path: string;
  recursive?: boolean;
}

export function createRmTool(_context: ToolContext): ToolDefinition<RmInput, { success: true }> {
  return {
    name: "Rm",
    description: "Remove a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to remove" },
        recursive: { type: "boolean", description: "Remove recursively" },
      },
      required: ["path"],
    },
    async run(input) {
      await removePath(input.path, { recursive: input.recursive });
      return { success: true };
    },
  };
}

import type { ToolContext, ToolDefinition } from "./types.js";
import { movePath } from "../fs/ops.js";

export interface MoveInput {
  from: string;
  to: string;
  overwrite?: boolean;
}

export function createMoveTool(_context: ToolContext): ToolDefinition<MoveInput, { success: true }> {
  return {
    name: "Move",
    description: "Move or rename a file or directory.",
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
      await movePath(input.from, input.to, { overwrite: input.overwrite });
      return { success: true };
    },
  };
}

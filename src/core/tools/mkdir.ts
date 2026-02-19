import type { ToolContext, ToolDefinition } from "./types.js";
import { ensureDir } from "../fs/ops.js";

export interface MkdirInput {
  path: string;
  mode?: number;
}

export function createMkdirTool(_context: ToolContext): ToolDefinition<MkdirInput, { success: true }> {
  return {
    name: "Mkdir",
    description: "Create a directory (recursive).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        mode: { type: "number", description: "Directory mode (octal as number)" },
      },
      required: ["path"],
    },
    async run(input) {
      await ensureDir(input.path, input.mode);
      return { success: true };
    },
  };
}

import type { ToolContext, ToolDefinition } from "./types.js";
import { statPath } from "../fs/ops.js";

export interface StatInput {
  path: string;
}

export function createStatTool(_context: ToolContext): ToolDefinition<StatInput, unknown> {
  return {
    name: "Stat",
    description: "Return file or directory metadata.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to stat" },
      },
      required: ["path"],
    },
    async run(input) {
      return statPath(input.path);
    },
  };
}

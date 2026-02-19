import type { ToolContext, ToolDefinition } from "./types.js";
import { walkTree } from "../fs/ops.js";

export interface TreeInput {
  path: string;
  max_depth?: number;
  include_hidden?: boolean;
  follow_symlinks?: boolean;
}

export function createTreeTool(_context: ToolContext): ToolDefinition<TreeInput, unknown> {
  return {
    name: "Tree",
    description: "Recursively list files under a path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Root path" },
        max_depth: { type: "number", description: "Maximum recursion depth" },
        include_hidden: { type: "boolean", description: "Include dotfiles" },
        follow_symlinks: { type: "boolean", description: "Follow symlinks" },
      },
      required: ["path"],
    },
    async run(input) {
      return walkTree(input.path, {
        maxDepth: input.max_depth,
        includeHidden: input.include_hidden,
        followSymlinks: input.follow_symlinks,
      });
    },
  };
}

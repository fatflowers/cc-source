import type { ToolContext, ToolDefinition } from "./types.js";
import { listDirectory } from "../fs/ops.js";

export interface LsInput {
  path: string;
  include_hidden?: boolean;
  follow_symlinks?: boolean;
}

export function createLsTool(_context: ToolContext): ToolDefinition<LsInput, unknown> {
  return {
    name: "Ls",
    description: "List directory entries.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        include_hidden: { type: "boolean", description: "Include dotfiles" },
        follow_symlinks: { type: "boolean", description: "Follow symlinks when statting entries" },
      },
      required: ["path"],
    },
    async run(input) {
      return listDirectory(input.path, {
        includeHidden: input.include_hidden,
        followSymlinks: input.follow_symlinks,
      });
    },
  };
}

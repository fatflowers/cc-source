import type { ToolContext, ToolDefinition } from "./types.js";
import { createBashTool } from "./bash.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createNotebookEditTool } from "./notebookEdit.js";
import { createStructuredOutputTool } from "./structuredOutput.js";
import { WEB_FETCH_TOOL_NAME } from "./webFetch.js";
import { WEB_SEARCH_TOOL_NAME } from "./webSearch.js";
import { createLsTool } from "./ls.js";
import { createStatTool } from "./stat.js";
import { createTreeTool } from "./tree.js";
import { createCopyTool } from "./copy.js";
import { createMoveTool } from "./move.js";
import { createRmTool } from "./rm.js";
import { createMkdirTool } from "./mkdir.js";
import { createSkillTool } from "./skill.js";

export const BUILTIN_TOOL_NAMES = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "NotebookEdit",
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  "Ls",
  "Stat",
  "Tree",
  "Copy",
  "Move",
  "Rm",
  "Mkdir",
  "Skill",
]);

export function createLocalTools(context: ToolContext): ToolDefinition[] {
  return [
    createReadTool(context),
    createWriteTool(context),
    createEditTool(context),
    createGlobTool(context),
    createGrepTool(context),
    createBashTool(context),
    createNotebookEditTool(context),
    createLsTool(context),
    createStatTool(context),
    createTreeTool(context),
    createCopyTool(context),
    createMoveTool(context),
    createRmTool(context),
    createMkdirTool(context),
    createSkillTool(context),
  ];
}

export type { ToolContext, ToolDefinition } from "./types.js";
export { createStructuredOutputTool };
export * from "./webSearch.js";
export * from "./webFetch.js";
export * from "./lruCache.js";
export * from "./skill.js";

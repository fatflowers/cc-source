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
  ];
}

export type { ToolContext, ToolDefinition } from "./types.js";
export { createStructuredOutputTool };
export * from "./webSearch.js";
export * from "./webFetch.js";
export * from "./lruCache.js";

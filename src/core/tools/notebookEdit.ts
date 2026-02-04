import { readFile, writeFile } from "node:fs/promises";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface NotebookEditInput {
  notebook_path?: string;
  file_path?: string;
  cell_index: number;
  new_source: string | string[];
}

export interface NotebookEditResult {
  filePath: string;
  cellIndex: number;
}

export function createNotebookEditTool(_context: ToolContext): ToolDefinition<NotebookEditInput, NotebookEditResult> {
  return {
    name: "NotebookEdit",
    description: "Edit a Jupyter notebook cell by index.",
    inputSchema: {
      type: "object",
      properties: {
        notebook_path: { type: "string", description: "Path to notebook" },
        file_path: { type: "string", description: "Alias for notebook_path" },
        cell_index: { type: "number", description: "Cell index to update" },
        new_source: { type: ["string", "array"], description: "New cell source" },
      },
      required: ["cell_index", "new_source"],
    },
    async run(input) {
      const filePath = input.notebook_path ?? input.file_path;
      if (!filePath) {
        throw new Error("notebook_path is required");
      }

      const raw = await readFile(filePath, "utf8");
      const notebook = JSON.parse(raw) as { cells?: Array<{ source?: string | string[] }> };

      if (!Array.isArray(notebook.cells)) {
        throw new Error("Invalid notebook: missing cells array");
      }

      const cell = notebook.cells[input.cell_index];
      if (!cell) {
        throw new Error(`Cell index ${input.cell_index} is out of range`);
      }

      cell.source = input.new_source;
      await writeFile(filePath, JSON.stringify(notebook, null, 2), "utf8");

      return { filePath, cellIndex: input.cell_index };
    },
  };
}

import { readFile, writeFile } from "node:fs/promises";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface StructuredPatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface EditResult {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string;
  structuredPatch: StructuredPatchHunk[];
  userModified: boolean;
  replaceAll: boolean;
  replacedCount: number;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
}

function buildStructuredPatch(original: string, updated: string): StructuredPatchHunk[] {
  if (original === updated) return [];
  const oldLines = original.split(/\r?\n/);
  const newLines = updated.split(/\r?\n/);

  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start += 1;
  }

  let endOld = oldLines.length - 1;
  let endNew = newLines.length - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld -= 1;
    endNew -= 1;
  }

  const removed = oldLines.slice(start, endOld + 1).map((line) => `-${line}`);
  const added = newLines.slice(start, endNew + 1).map((line) => `+${line}`);
  const lines = [...removed, ...added];

  return [
    {
      oldStart: start + 1,
      oldLines: Math.max(0, endOld - start + 1),
      newStart: start + 1,
      newLines: Math.max(0, endNew - start + 1),
      lines,
    },
  ];
}

function buildGitDiff(filePath: string, original: string, updated: string, hunks: StructuredPatchHunk[]) {
  if (hunks.length === 0) return undefined;
  const additions = hunks.reduce(
    (total, hunk) => total + hunk.lines.filter((line) => line.startsWith("+")).length,
    0
  );
  const deletions = hunks.reduce(
    (total, hunk) => total + hunk.lines.filter((line) => line.startsWith("-")).length,
    0
  );
  const header = `diff --git a/${filePath} b/${filePath}\nindex 0000000..0000000 100644\n--- a/${filePath}\n+++ b/${filePath}`;
  const hunkText = hunks
    .map(
      (hunk) =>
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${hunk.lines.join(
          "\n"
        )}`
    )
    .join("\n");
  return {
    filename: filePath,
    status: "modified" as const,
    additions,
    deletions,
    changes: additions + deletions,
    patch: `${header}\n${hunkText}`,
  };
}

export function createEditTool(_context: ToolContext): ToolDefinition<EditInput, EditResult> {
  return {
    name: "Edit",
    description: "Replace text in a file.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file" },
        old_string: { type: "string", description: "Text to replace" },
        new_string: { type: "string", description: "Replacement text" },
        replace_all: { type: "boolean", description: "Replace all occurrences" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    async run(input) {
      const original = await readFile(input.file_path, "utf8");

      if (!original.includes(input.old_string)) {
        throw new Error("old_string not found in file");
      }

      let replacedCount = 0;
      let updated: string;

      if (input.replace_all) {
        const parts = original.split(input.old_string);
        replacedCount = parts.length - 1;
        updated = parts.join(input.new_string);
      } else {
        replacedCount = 1;
        updated = original.replace(input.old_string, input.new_string);
      }

      await writeFile(input.file_path, updated, "utf8");

      const structuredPatch = buildStructuredPatch(original, updated);
      const gitDiff = buildGitDiff(input.file_path, original, updated, structuredPatch);

      return {
        filePath: input.file_path,
        oldString: input.old_string,
        newString: input.new_string,
        originalFile: original,
        structuredPatch,
        userModified: false,
        replaceAll: Boolean(input.replace_all),
        replacedCount,
        gitDiff,
      };
    },
  };
}

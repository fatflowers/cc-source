import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolContext, ToolDefinition } from "./types.js";
import { createGlobTool } from "./glob.js";

export interface GrepInput {
  pattern: string;
  glob?: string;
  paths?: string[];
  cwd?: string;
  case_sensitive?: boolean;
  output_mode?: "content" | "files_with_matches" | "count";
}

export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

export type GrepOutput = GrepMatch[] | string[] | Record<string, number>;

export function createGrepTool(context: ToolContext): ToolDefinition<GrepInput, GrepOutput> {
  return {
    name: "Grep",
    description: "Search for a pattern within files.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern" },
        glob: { type: "string", description: "Glob filter" },
        paths: { type: "array", items: { type: "string" }, description: "Explicit file paths" },
        cwd: { type: "string", description: "Working directory" },
        case_sensitive: { type: "boolean", description: "Case-sensitive search" },
      },
      required: ["pattern"],
    },
    async run(input) {
      const cwd = resolve(input.cwd ?? context.cwd);
      const files = input.paths
        ? input.paths.map((p) => resolve(p))
        : input.glob
          ? await createGlobTool({ cwd }).run({ pattern: input.glob, cwd })
          : await createGlobTool({ cwd }).run({ pattern: "**/*", cwd });

      const flags = input.case_sensitive ? "g" : "gi";
      const regex = new RegExp(input.pattern, flags);
      const matches: GrepMatch[] = [];
      const counts: Record<string, number> = {};
      const filesWithMatches = new Set<string>();

      for (const file of files) {
        const content = await readFile(file, "utf8");
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          let match: RegExpExecArray | null;
          while ((match = regex.exec(line)) !== null) {
            matches.push({
              file,
              line: index + 1,
              column: match.index + 1,
              text: line,
            });
            counts[file] = (counts[file] ?? 0) + 1;
            filesWithMatches.add(file);
          }
        });
      }

      if (input.output_mode === "files_with_matches") {
        return Array.from(filesWithMatches);
      }
      if (input.output_mode === "count") {
        return counts;
      }
      return matches;
    },
  };
}

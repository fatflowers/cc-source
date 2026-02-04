import { stat, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface GlobInput {
  pattern: string;
  cwd?: string;
}

function globToRegex(pattern: string): RegExp {
  let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  escaped = escaped
    .replace(/\\\*\\\*/g, "__GLOBSTAR__")
    .replace(/\\\*/g, "[^/]*")
    .replace(/\\\?/g, "[^/]");
  escaped = escaped.replace(/__GLOBSTAR__/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export function createGlobTool(context: ToolContext): ToolDefinition<GlobInput, string[]> {
  return {
    name: "Glob",
    description: "Find files matching a glob pattern.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["pattern"],
    },
    async run(input) {
      const cwd = resolve(input.cwd ?? context.cwd);
      const regex = globToRegex(input.pattern.split(sep).join("/"));
      const files = await walk(cwd);
      const matches = [] as { path: string; mtimeMs: number }[];
      for (const file of files) {
        const rel = file.slice(cwd.length + 1).split(sep).join("/");
        if (regex.test(rel)) {
          const info = await stat(file);
          matches.push({ path: file, mtimeMs: info.mtimeMs });
        }
      }
      matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return matches.map((match) => match.path);
    },
  };
}

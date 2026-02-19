import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SkillDocument } from "./types.js";

export interface SkillReferenceContent {
  path: string;
  content?: string;
  error?: string;
}

export interface LoadSkillReferencesOptions {
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export async function loadSkillReferencedFiles(
  skill: SkillDocument,
  options: LoadSkillReferencesOptions = {}
): Promise<SkillReferenceContent[]> {
  const maxFiles = options.maxFiles ?? 24;
  const maxBytesPerFile = options.maxBytesPerFile ?? 256 * 1024;
  const uniquePaths = Array.from(
    new Set(skill.references.map((ref) => normalizeReferencePath(ref.value)).filter((value) => value.length > 0))
  ).slice(0, maxFiles);

  const tasks = uniquePaths.map(async (relativePath) => {
    const absolutePath = join(skill.directory, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        return { path: absolutePath, error: "not a file" };
      }
      if (fileStat.size > maxBytesPerFile) {
        return { path: absolutePath, error: `file too large (${fileStat.size} bytes)` };
      }
      const content = await readFile(absolutePath, "utf8");
      return { path: absolutePath, content };
    } catch (error) {
      return {
        path: absolutePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return Promise.all(tasks);
}

function normalizeReferencePath(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";
  if (/^(https?:\/\/|file:\/\/|vscode:\/\/)/i.test(cleaned)) return "";
  if (cleaned.startsWith("/")) return "";
  return cleaned;
}

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseSkillsFromAgentsInstructions } from "./agentsParser.js";
import type { SkillDescriptor } from "./types.js";

const AGENTS_FILE_NAME = "AGENTS.md";

export interface AgentsSearchOptions {
  maxLevels?: number;
}

export async function findNearestAgentsFile(startDir: string, options: AgentsSearchOptions = {}) {
  const maxLevels = options.maxLevels ?? 12;
  let current = resolve(startDir);

  for (let i = 0; i <= maxLevels; i += 1) {
    const candidate = join(current, AGENTS_FILE_NAME);
    try {
      const content = await readFile(candidate, "utf8");
      return { path: candidate, content };
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

export async function loadSkillsFromNearestAgentsFile(
  startDir: string,
  options: AgentsSearchOptions = {}
): Promise<{ filePath?: string; descriptors: SkillDescriptor[] }> {
  const found = await findNearestAgentsFile(startDir, options);
  if (!found) return { descriptors: [] };
  const baseDir = dirname(found.path);
  const parsed = parseSkillsFromAgentsInstructions(found.content);
  const descriptors = parsed.map((descriptor) => ({
    ...descriptor,
    path: isAbsolute(descriptor.path) ? descriptor.path : resolve(baseDir, descriptor.path),
  }));

  return {
    filePath: found.path,
    descriptors,
  };
}

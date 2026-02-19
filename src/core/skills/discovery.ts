import { readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseSkillsFromAgentsInstructions } from "./agentsParser.js";
import { loadSkills } from "./loader.js";
import type { SkillDescriptor, SkillLoadIssue, SkillLoadResult } from "./types.js";

export interface DiscoverSkillsOptions {
  maxDepth?: number;
}

export async function discoverSkillDescriptors(roots: string[], options: DiscoverSkillsOptions = {}): Promise<SkillDescriptor[]> {
  const maxDepth = options.maxDepth ?? 4;
  const found: SkillDescriptor[] = [];
  const visitedRealPaths = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let real: string;
    try {
      real = await realpath(dir);
    } catch {
      return;
    }

    if (visitedRealPaths.has(real)) return;
    visitedRealPaths.add(real);

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        const name = basename(dir) || "skill";
        found.push({ name, path: fullPath });
      }
    }
  }

  await Promise.all(roots.map((root) => walk(root, 0)));
  return dedupeSkillDescriptors(found);
}

export async function loadSkillsFromAgentsText(
  agentsInstructions: string
): Promise<SkillLoadResult & { descriptors: SkillDescriptor[] }> {
  const descriptors = parseSkillsFromAgentsInstructions(agentsInstructions);
  const result = await loadSkills(descriptors);
  return { ...result, descriptors };
}

export function summarizeSkillIssues(issues: SkillLoadIssue[]): string[] {
  return issues.map((issue) => `${issue.code}: ${issue.path} (${issue.message})`);
}

function dedupeSkillDescriptors(input: SkillDescriptor[]): SkillDescriptor[] {
  const map = new Map<string, SkillDescriptor>();
  for (const item of input) {
    const key = item.path;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

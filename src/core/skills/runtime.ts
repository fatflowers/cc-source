import { detectTriggeredSkills } from "./agentsParser.js";
import { loadSkills } from "./loader.js";
import type { SkillDescriptor, SkillDocument, SkillLoadIssue } from "./types.js";

export interface SkillResolutionResult {
  selected: SkillDescriptor[];
  loaded: SkillDocument[];
  issues: SkillLoadIssue[];
}

export async function resolveTriggeredSkills(
  request: string,
  available: SkillDescriptor[]
): Promise<SkillResolutionResult> {
  const selected = detectTriggeredSkills(request, available);
  if (selected.length === 0) {
    return { selected: [], loaded: [], issues: [] };
  }

  const result = await loadSkills(selected);
  return {
    selected,
    loaded: result.skills,
    issues: result.issues,
  };
}

export function formatSkillAnnouncement(selected: SkillDescriptor[]): string {
  if (selected.length === 0) return "";
  if (selected.length === 1) {
    return `Using skill: ${selected[0].name}`;
  }
  return `Using skills: ${selected.map((skill) => skill.name).join(", ")}`;
}

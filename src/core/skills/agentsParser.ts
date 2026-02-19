import type { SkillDescriptor } from "./types.js";

const SKILL_LINE_REGEX = /^-\s+([a-zA-Z0-9._-]+):\s+(.*?)\s+\(file:\s*([^)]+)\)\s*$/gm;

export function parseSkillsFromAgentsInstructions(text: string): SkillDescriptor[] {
  const skills: SkillDescriptor[] = [];
  for (const match of text.matchAll(SKILL_LINE_REGEX)) {
    const name = (match[1] ?? "").trim();
    const description = (match[2] ?? "").trim();
    const path = (match[3] ?? "").trim();
    if (!name || !path) continue;
    skills.push({
      name,
      description,
      path,
    });
  }
  return dedupeSkills(skills);
}

export function detectTriggeredSkills(request: string, available: SkillDescriptor[]): SkillDescriptor[] {
  const normalized = request.toLowerCase();
  const out: SkillDescriptor[] = [];

  for (const skill of available) {
    const name = skill.name.toLowerCase();
    const asVariable = `$${name}`;
    const mentionedByVariable = normalized.includes(asVariable);
    const mentionedByWord = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(request);
    if (!mentionedByVariable && !mentionedByWord) continue;
    out.push(skill);
  }

  return dedupeSkills(out);
}

function dedupeSkills(input: SkillDescriptor[]): SkillDescriptor[] {
  const map = new Map<string, SkillDescriptor>();
  for (const skill of input) {
    const key = skill.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, skill);
    }
  }
  return Array.from(map.values());
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

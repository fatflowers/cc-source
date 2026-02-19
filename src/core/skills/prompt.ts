import { loadSkillsFromNearestAgentsFile } from "./agentsFile.js";
import { loadSkillReferencedFiles } from "./executor.js";
import { resolveTriggeredSkills } from "./runtime.js";
import type { SkillDescriptor, SkillLoadIssue } from "./types.js";

export interface BuildSkillsSystemPromptOptions {
  cwd: string;
  request: string;
  disableSlashCommands?: boolean;
  maxAgentsLevels?: number;
  includeReferencedFiles?: boolean;
  maxReferencedFiles?: number;
  maxReferencedBytesPerFile?: number;
}

export interface BuildSkillsSystemPromptResult {
  text?: string;
  agentsFilePath?: string;
  available: SkillDescriptor[];
  selected: SkillDescriptor[];
  issues: SkillLoadIssue[];
}

export async function buildSkillsSystemPrompt(
  options: BuildSkillsSystemPromptOptions
): Promise<BuildSkillsSystemPromptResult> {
  if (options.disableSlashCommands) {
    return {
      available: [],
      selected: [],
      issues: [],
    };
  }

  const fromAgents = await loadSkillsFromNearestAgentsFile(options.cwd, {
    maxLevels: options.maxAgentsLevels,
  });
  const available = fromAgents.descriptors;
  if (available.length === 0) {
    return {
      agentsFilePath: fromAgents.filePath,
      available,
      selected: [],
      issues: [],
    };
  }

  const resolved = await resolveTriggeredSkills(options.request, available);
  const lines: string[] = [];

  lines.push("# Skills");
  if (fromAgents.filePath) {
    lines.push(`Loaded from: ${fromAgents.filePath}`);
  }
  lines.push("When the user request matches a skill, follow that skill's instructions.");
  lines.push("Available skills:");
  for (const skill of available) {
    const description = skill.description ? ` - ${skill.description}` : "";
    lines.push(`- ${skill.name}${description} (file: ${skill.path})`);
  }

  if (resolved.selected.length > 0) {
    lines.push("");
    lines.push("Triggered skills for this request:");
    for (const skill of resolved.selected) {
      lines.push(`- ${skill.name}`);
    }
  }

  for (const skill of resolved.loaded) {
    lines.push("");
    lines.push(`## Skill: ${skill.descriptor.name}`);
    lines.push(`Path: ${skill.resolvedPath}`);
    lines.push(skill.body.trimEnd());

    if (options.includeReferencedFiles === false) {
      continue;
    }

    const refs = await loadSkillReferencedFiles(skill, {
      maxFiles: options.maxReferencedFiles,
      maxBytesPerFile: options.maxReferencedBytesPerFile,
    });
    if (refs.length === 0) continue;

    lines.push("");
    lines.push(`### Referenced files for ${skill.descriptor.name}`);
    for (const ref of refs) {
      lines.push(`- ${ref.path}`);
      if (ref.error) {
        lines.push(`  [error] ${ref.error}`);
        continue;
      }
      if (!ref.content) continue;
      lines.push("```");
      lines.push(ref.content.trimEnd());
      lines.push("```");
    }
  }

  if (resolved.issues.length > 0) {
    lines.push("");
    lines.push("Skill load issues:");
    for (const issue of resolved.issues) {
      lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    }
  }

  return {
    text: lines.join("\n").trim(),
    agentsFilePath: fromAgents.filePath,
    available,
    selected: resolved.selected,
    issues: resolved.issues,
  };
}

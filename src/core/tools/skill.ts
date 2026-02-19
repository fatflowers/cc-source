import { loadSkillsFromNearestAgentsFile } from "../skills/agentsFile.js";
import { loadSkill } from "../skills/loader.js";
import { loadSkillReferencedFiles } from "../skills/executor.js";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface SkillToolInput {
  skill: string;
  args?: string;
  prompt?: string;
  include_references?: boolean;
  max_reference_files?: number;
  max_reference_bytes?: number;
}

export interface SkillToolResult {
  skill: string;
  source: string;
  instructions: string;
  args?: string;
  prompt?: string;
  references?: Array<{ path: string; content?: string; error?: string }>;
}

export function createSkillTool(context: ToolContext): ToolDefinition<SkillToolInput, SkillToolResult> {
  return {
    name: "Skill",
    description: "Load and return the full instructions for a named skill from AGENTS.md.",
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill name to load" },
        args: { type: "string", description: "Optional argument string passed to the skill" },
        prompt: { type: "string", description: "Optional extra prompt for the skill" },
        include_references: { type: "boolean", description: "Include referenced skill files" },
        max_reference_files: { type: "number", description: "Maximum number of referenced files to load" },
        max_reference_bytes: { type: "number", description: "Maximum bytes per referenced file" },
      },
      required: ["skill"],
    },
    async run(input) {
      const skillName = input.skill.trim();
      if (!skillName) {
        throw new Error("skill is required");
      }

      const fromAgents = await loadSkillsFromNearestAgentsFile(context.cwd);
      if (fromAgents.descriptors.length === 0) {
        throw new Error(`No skills found from AGENTS.md near ${context.cwd}`);
      }

      const descriptor = fromAgents.descriptors.find((item) => item.name.toLowerCase() === skillName.toLowerCase());
      if (!descriptor) {
        const names = fromAgents.descriptors.map((item) => item.name).join(", ");
        throw new Error(`Skill '${skillName}' not found. Available: ${names}`);
      }

      const loaded = await loadSkill(descriptor);
      if (!loaded.skill) {
        throw new Error(loaded.issue?.message ?? `Failed to load skill '${skillName}'`);
      }

      const result: SkillToolResult = {
        skill: loaded.skill.descriptor.name,
        source: loaded.skill.resolvedPath,
        instructions: loaded.skill.body,
        args: input.args,
        prompt: input.prompt,
      };

      if (input.include_references === false) {
        return result;
      }

      const references = await loadSkillReferencedFiles(loaded.skill, {
        maxFiles: input.max_reference_files,
        maxBytesPerFile: input.max_reference_bytes,
      });
      result.references = references;
      return result;
    },
  };
}

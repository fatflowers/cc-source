import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseSkillDocument } from "./parser.js";
import type { SkillDescriptor, SkillDocument, SkillLoadIssue, SkillLoadResult } from "./types.js";

const SKILL_FILE_NAME = "SKILL.md";

export async function loadSkills(descriptors: SkillDescriptor[]): Promise<SkillLoadResult> {
  const loaded: SkillDocument[] = [];
  const issues: SkillLoadIssue[] = [];

  const tasks = descriptors.map(async (descriptor) => {
    const single = await loadSkill(descriptor);
    if (single.skill) loaded.push(single.skill);
    if (single.issue) issues.push(single.issue);
  });

  await Promise.all(tasks);
  return { skills: loaded, issues };
}

export async function loadSkill(descriptor: SkillDescriptor): Promise<{ skill?: SkillDocument; issue?: SkillLoadIssue }> {
  const skillPath = descriptor.path?.trim();
  if (!skillPath) {
    return {
      issue: {
        code: "invalid-path",
        path: descriptor.path,
        message: "Skill path is empty",
      },
    };
  }

  try {
    const concretePath = await resolveSkillFilePath(skillPath);
    const resolved = await realpath(concretePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ELOOP") {
        throw new SkillLoadError("symlink-loop", concretePath, "Skill path contains a symbolic link loop");
      }
      throw error;
    });

    const source = await readFile(resolved, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ELOOP") {
        throw new SkillLoadError("symlink-loop", resolved, "Skill file contains a symbolic link loop");
      }
      throw new SkillLoadError("read-failed", resolved, `Failed to read skill file: ${error.message}`);
    });

    try {
      return { skill: parseSkillDocument(descriptor, resolved, source) };
    } catch (error) {
      return {
        issue: {
          code: "parse-failed",
          path: resolved,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  } catch (error) {
    if (error instanceof SkillLoadError) {
      return { issue: { code: error.code, path: error.path, message: error.message } };
    }

    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        issue: {
          code: "not-found",
          path: skillPath,
          message: "Skill file not found",
        },
      };
    }
    if (nodeError?.code === "ELOOP") {
      return {
        issue: {
          code: "symlink-loop",
          path: skillPath,
          message: "Skill path contains a symbolic link loop",
        },
      };
    }

    return {
      issue: {
        code: "read-failed",
        path: skillPath,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function resolveSkillFilePath(pathValue: string): Promise<string> {
  const pathStat = await lstat(pathValue).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      throw new SkillLoadError("not-found", pathValue, "Skill path does not exist");
    }
    if (error.code === "ELOOP") {
      throw new SkillLoadError("symlink-loop", pathValue, "Skill path contains a symbolic link loop");
    }
    throw error;
  });

  if (pathStat.isDirectory()) {
    const candidate = join(pathValue, SKILL_FILE_NAME);
    await stat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new SkillLoadError("not-found", candidate, `Expected ${SKILL_FILE_NAME} in skill directory`);
      }
      if (error.code === "ELOOP") {
        throw new SkillLoadError("symlink-loop", candidate, "Skill file path contains a symbolic link loop");
      }
      throw error;
    });
    return candidate;
  }

  if (pathValue.endsWith("/") || pathValue.endsWith("\\")) {
    throw new SkillLoadError("invalid-path", pathValue, "Skill path ends with '/' but is not a directory");
  }

  if (basename(pathValue).toLowerCase() !== SKILL_FILE_NAME.toLowerCase()) {
    return pathValue;
  }

  return pathValue;
}

export function resolveRelativeSkillPath(skill: SkillDocument, relativePath: string): string {
  return join(dirname(skill.resolvedPath), relativePath);
}

class SkillLoadError extends Error {
  constructor(
    public readonly code: SkillLoadIssue["code"],
    public readonly path: string,
    message: string
  ) {
    super(message);
    this.name = "SkillLoadError";
  }
}

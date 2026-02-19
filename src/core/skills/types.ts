export interface SkillDescriptor {
  name: string;
  description?: string;
  path: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface SkillReference {
  type: "relative-link" | "inline-path";
  value: string;
}

export interface SkillDocument {
  descriptor: SkillDescriptor;
  resolvedPath: string;
  directory: string;
  frontmatter: SkillFrontmatter;
  body: string;
  references: SkillReference[];
}

export type SkillLoadIssueCode =
  | "not-found"
  | "invalid-path"
  | "symlink-loop"
  | "read-failed"
  | "parse-failed";

export interface SkillLoadIssue {
  code: SkillLoadIssueCode;
  path: string;
  message: string;
}

export interface SkillLoadResult {
  skills: SkillDocument[];
  issues: SkillLoadIssue[];
}

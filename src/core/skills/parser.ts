import { basename, dirname } from "node:path";
import type { SkillDescriptor, SkillDocument, SkillFrontmatter, SkillReference } from "./types.js";

const FRONTMATTER_BOUNDARY = "---";

export function parseSkillDocument(descriptor: SkillDescriptor, resolvedPath: string, raw: string): SkillDocument {
  const { frontmatter, body } = splitFrontmatter(raw);
  return {
    descriptor: {
      ...descriptor,
      name: descriptor.name || frontmatter.name || basename(resolvedPath, ".md"),
      description: descriptor.description || frontmatter.description,
    },
    resolvedPath,
    directory: dirname(resolvedPath),
    frontmatter,
    body,
    references: extractSkillReferences(body),
  };
}

export function splitFrontmatter(input: string): { frontmatter: SkillFrontmatter; body: string } {
  const normalized = input.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return { frontmatter: {}, body: normalized };
  }

  const end = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);
  if (end < 0) {
    return { frontmatter: {}, body: normalized };
  }

  const rawFrontmatter = normalized.slice(FRONTMATTER_BOUNDARY.length + 1, end);
  const body = normalized.slice(end + FRONTMATTER_BOUNDARY.length + 2).replace(/^\n/, "");
  return {
    frontmatter: parseSimpleYaml(rawFrontmatter),
    body,
  };
}

export function parseSimpleYaml(input: string): SkillFrontmatter {
  const out: SkillFrontmatter = {};
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function extractSkillReferences(markdown: string): SkillReference[] {
  const refs: SkillReference[] = [];

  const markdownLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(markdownLinkRegex)) {
    const value = match[1]?.trim();
    if (!value || isExternalLink(value)) continue;
    refs.push({ type: "relative-link", value });
  }

  const inlinePathRegex = /`([^`]*\/(?:scripts|references|assets|templates)\/[^`]+)`/g;
  for (const match of markdown.matchAll(inlinePathRegex)) {
    const value = match[1]?.trim();
    if (!value) continue;
    refs.push({ type: "inline-path", value });
  }

  return dedupeReferences(refs);
}

function dedupeReferences(input: SkillReference[]): SkillReference[] {
  const seen = new Set<string>();
  const out: SkillReference[] = [];
  for (const ref of input) {
    const key = `${ref.type}:${ref.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function isExternalLink(value: string): boolean {
  return /^(https?:\/\/|file:\/\/|vscode:\/\/)/i.test(value);
}

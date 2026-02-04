import type { ToolRule } from "./types.js";

export function parseToolRule(input: string): ToolRule {
  const match = input.match(/^([^(]+)\(([^)]+)\)$/);
  if (!match) return { toolName: input };
  const toolName = match[1];
  const ruleContent = match[2];
  if (!toolName || !ruleContent) return { toolName: input };
  return { toolName, ruleContent };
}

export function stripWildcardSuffix(input: string) {
  return input.match(/^(.+):\*$/)?.[1] ?? null;
}

export function parseToolRules(values: string[] | undefined): ToolRule[] {
  if (!values) return [];
  return values.map((value) => parseToolRule(value)).filter((rule) => rule.toolName.trim().length > 0);
}

export function matchRule(toolName: string, rule: ToolRule) {
  if (rule.toolName === toolName) return true;
  if (rule.toolName.endsWith("*") && toolName.startsWith(rule.toolName.slice(0, -1))) return true;
  return false;
}

export function ruleApplies(toolName: string, rule: ToolRule, input?: Record<string, unknown>) {
  if (!matchRule(toolName, rule)) return false;
  if (!rule.ruleContent) return true;

  const wildcard = stripWildcardSuffix(rule.ruleContent);
  if (wildcard) {
    const value = input?.command || input?.file_path || "";
    return typeof value === "string" && value.startsWith(wildcard);
  }

  return true;
}

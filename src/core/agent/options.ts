import type { AgentIdentity, TeammateMode } from "./types.js";

export interface ParsedTeammateOptions extends AgentIdentity {
  teammateMode?: TeammateMode;
}

export function parseTeammateOptions(input: unknown): ParsedTeammateOptions {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;

  const mode = parseTeammateMode(raw.teammateMode);
  return {
    agentId: asString(raw.agentId),
    agentName: asString(raw.agentName),
    teamName: asString(raw.teamName),
    agentColor: asString(raw.agentColor),
    planModeRequired: asBoolean(raw.planModeRequired),
    parentSessionId: asString(raw.parentSessionId),
    teammateMode: mode,
    agentType: asString(raw.agentType),
  };
}

function parseTeammateMode(value: unknown): TeammateMode | undefined {
  if (value === "auto" || value === "tmux" || value === "in-process") return value;
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") return undefined;
  return value;
}

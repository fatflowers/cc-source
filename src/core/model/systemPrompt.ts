export const BASE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";
export const SDK_SYSTEM_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.";
export const AGENT_SYSTEM_PROMPT = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";

export interface SystemPromptContext {
  provider?: "vertex" | "bedrock" | "default" | string;
  isNonInteractive?: boolean;
  hasAppendSystemPrompt?: boolean;
}

export function getBaseSystemPrompt(context: SystemPromptContext = {}): string {
  if (context.provider === "vertex") {
    return BASE_SYSTEM_PROMPT;
  }

  if (context.isNonInteractive) {
    return context.hasAppendSystemPrompt ? SDK_SYSTEM_PROMPT : AGENT_SYSTEM_PROMPT;
  }

  return BASE_SYSTEM_PROMPT;
}

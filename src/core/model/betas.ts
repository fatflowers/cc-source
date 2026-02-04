export const CLAUDE_CODE_BETA = "claude-code-20250219";
export const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";
export const CONTEXT_1M_BETA = "context-1m-2025-08-07";
export const CONTEXT_MANAGEMENT_BETA = "context-management-2025-06-27";
export const STRUCTURED_OUTPUT_BETA = "structured-outputs-2025-12-15";
export const WEB_SEARCH_BETA = "web-search-2025-03-05";
export const TOOL_EXAMPLES_BETA = "tool-examples-2025-10-29";
export const ADVANCED_TOOL_USE_BETA = "advanced-tool-use-2025-11-20";
export const TOOL_SEARCH_TOOL_BETA = "tool-search-tool-2025-10-19";
export const EFFORT_BETA = "effort-2025-11-24";
export const PROMPT_CACHING_SCOPE_BETA = "prompt-caching-scope-2026-01-05";
export const OAUTH_BETA = "oauth-2025-04-20";
export const FINE_GRAINED_TOOL_STREAMING_BETA = "fine-grained-tool-streaming-2025-05-14";

export const BEDROCK_UNSUPPORTED_BETAS = new Set([
  INTERLEAVED_THINKING_BETA,
  CONTEXT_1M_BETA,
  TOOL_SEARCH_TOOL_BETA,
  TOOL_EXAMPLES_BETA,
]);

export const ALLOWED_CUSTOM_BETAS = new Set([
  CLAUDE_CODE_BETA,
  INTERLEAVED_THINKING_BETA,
  FINE_GRAINED_TOOL_STREAMING_BETA,
  CONTEXT_MANAGEMENT_BETA,
]);

export type ProviderType = "firstParty" | "foundry" | "vertex" | "bedrock" | "default" | string;

export interface BetaOptions {
  provider?: ProviderType;
  isOAuth?: boolean;
  featureFlags?: Record<string, boolean>;
  allowExperimental?: boolean;
}

function envTruthy(value?: string) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isExperimentalBetasEnabled(provider: ProviderType, allowExperimental?: boolean) {
  if (allowExperimental !== undefined) return allowExperimental;
  const enabledProviders = provider === "firstParty" || provider === "foundry";
  const disabled = envTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS);
  return enabledProviders && !disabled;
}

export function supportsInterleavedThinking(model: string, provider: ProviderType) {
  if (provider === "foundry") return true;
  if (provider === "firstParty") return !model.includes("claude-3-");
  return model.includes("claude-opus-4") || model.includes("claude-sonnet-4");
}

export function supportsContextManagement(model: string, provider: ProviderType) {
  if (provider === "foundry") return true;
  if (provider === "firstParty") return !model.includes("claude-3-");
  return (
    model.includes("claude-opus-4") ||
    model.includes("claude-sonnet-4") ||
    model.includes("claude-haiku-4")
  );
}

export function supportsWebSearch(model: string, provider: ProviderType) {
  const lowered = model.toLowerCase();
  if (provider === "vertex") {
    return (
      lowered.includes("claude-opus-4") ||
      lowered.includes("claude-sonnet-4") ||
      lowered.includes("claude-haiku-4")
    );
  }
  return provider === "foundry";
}

export function supportsStructuredOutput(model: string, provider: ProviderType) {
  if (provider !== "firstParty" && provider !== "foundry") return false;
  return (
    model.includes("claude-sonnet-4-5") ||
    model.includes("claude-opus-4-1") ||
    model.includes("claude-opus-4-5") ||
    model.includes("claude-haiku-4-5")
  );
}

export function getToolSearchBeta(provider: ProviderType) {
  if (provider === "vertex" || provider === "bedrock") {
    return TOOL_SEARCH_TOOL_BETA;
  }
  return ADVANCED_TOOL_USE_BETA;
}

export function getModelBetas(model: string, options: BetaOptions = {}) {
  const provider = options.provider ?? "default";
  const featureFlags = options.featureFlags ?? {};
  const experimental = isExperimentalBetasEnabled(provider, options.allowExperimental);
  const betas: string[] = [];

  const isHaiku = model.includes("haiku");
  if (!isHaiku) {
    betas.push(CLAUDE_CODE_BETA);
  }

  if (options.isOAuth) {
    betas.push(OAUTH_BETA);
  }

  if (model.includes("[1m]")) {
    betas.push(CONTEXT_1M_BETA);
  }

  if (!envTruthy(process.env.DISABLE_INTERLEAVED_THINKING) && supportsInterleavedThinking(model, provider)) {
    betas.push(INTERLEAVED_THINKING_BETA);
  }

  const useContextManagement =
    supportsContextManagement(model, provider) && featureFlags.tengu_marble_anvil === true;
  if (experimental && useContextManagement) {
    betas.push(CONTEXT_MANAGEMENT_BETA);
  }

  if (supportsStructuredOutput(model, provider) && featureFlags.tengu_tool_pear === true) {
    betas.push(STRUCTURED_OUTPUT_BETA);
  }

  if (experimental && featureFlags.tengu_scarf_coffee === true) {
    betas.push(TOOL_EXAMPLES_BETA);
  }

  if (supportsWebSearch(model, provider)) {
    betas.push(WEB_SEARCH_BETA);
  }

  if (experimental) {
    betas.push(PROMPT_CACHING_SCOPE_BETA);
  }

  const envBetas = process.env.ANTHROPIC_BETAS;
  if (envBetas && !isHaiku) {
    betas.push(
      ...envBetas
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }

  if (provider === "bedrock") {
    return betas.filter((beta) => !BEDROCK_UNSUPPORTED_BETAS.has(beta));
  }

  return betas;
}

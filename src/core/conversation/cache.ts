export type CacheScope = "global" | null;

function envTruthy(value?: string) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function createCacheControl(scope: CacheScope = null) {
  const disableTtl = envTruthy(process.env.CLAUDE_CODE_DISABLE_PROMPT_CACHE_TTL);
  const useTtl = !disableTtl && !envTruthy(process.env.CLAUDE_CODE_DISABLE_PROMPT_CACHING_TTL);
  return {
    type: "ephemeral",
    ...(useTtl ? { ttl: "1h" } : {}),
    ...(scope === "global" ? { scope } : {}),
  } as const;
}

export function shouldEnablePromptCaching(model: string) {
  if (envTruthy(process.env.DISABLE_PROMPT_CACHING)) return false;
  if (envTruthy(process.env.DISABLE_PROMPT_CACHING_HAIKU) && model.includes("haiku")) return false;
  if (envTruthy(process.env.DISABLE_PROMPT_CACHING_SONNET) && model.includes("sonnet")) return false;
  if (envTruthy(process.env.DISABLE_PROMPT_CACHING_OPUS) && model.includes("opus")) return false;
  return true;
}

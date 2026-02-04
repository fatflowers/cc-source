import type { AnthropicClient } from "./types.js";

export interface ClientOptions {
  apiKey?: string;
  maxRetries?: number;
  model?: string;
  fetchOverride?: typeof fetch;
}

export async function createAnthropicClient(_options: ClientOptions): Promise<AnthropicClient> {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const Client = (mod as any).default ?? (mod as any).Anthropic ?? (mod as any).Client;
    if (!Client) {
      throw new Error("Anthropic SDK default export not found");
    }
    return new Client({ apiKey: _options.apiKey, maxRetries: _options.maxRetries });
  } catch (error) {
    throw new Error(
      `Failed to load @anthropic-ai/sdk. Install it or provide a compatible client. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

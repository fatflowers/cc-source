import type { AnthropicClient, MessageParam } from "./types.js";
import { callModel } from "./request.js";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const KNOWN_ALIASES = new Set(["sonnet", "opus", "haiku"]);
const validatedModels = new Map<string, boolean>();

function formatModelNotFound(model: string) {
  return `Model '${model}' not found`;
}

function isNotFoundError(error: unknown, model: string) {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: string }).message ?? "";
  if (message.toLowerCase().includes("not found") && message.includes(model)) return true;
  const maybeError = error as { error?: { type?: string; message?: string } };
  if (maybeError.error?.type === "not_found_error" && maybeError.error.message?.includes("model:")) {
    return true;
  }
  return false;
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: string }).message ?? "";
  return message.toLowerCase().includes("authentication") || message.includes("invalid x-api-key");
}

function isNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: string }).message ?? "";
  return message.toLowerCase().includes("network") || message.includes("ECONN");
}

export async function validateModelName(
  client: AnthropicClient,
  model: string,
  options: { maxRetries?: number } = {}
): Promise<ValidationResult> {
  const trimmed = model.trim();
  if (!trimmed) {
    return { valid: false, error: "Model name cannot be empty" };
  }

  const normalized = trimmed.toLowerCase();
  if (KNOWN_ALIASES.has(normalized)) {
    return { valid: true };
  }

  if (validatedModels.has(trimmed)) {
    return { valid: true };
  }

  const messages: MessageParam[] = [
    {
      role: "user",
      content: [{ type: "text", text: "Hi", cache_control: { type: "ephemeral" } } as any],
    },
  ];

  try {
    await callModel(client, {
      model: trimmed,
      max_tokens: 1,
      maxRetries: options.maxRetries ?? 0,
      messages,
    });
    validatedModels.set(trimmed, true);
    return { valid: true };
  } catch (error) {
    if (isNotFoundError(error, trimmed)) {
      return { valid: false, error: formatModelNotFound(trimmed) };
    }
    if (isAuthError(error)) {
      return { valid: false, error: "Authentication failed. Please check your API credentials." };
    }
    if (isNetworkError(error)) {
      return { valid: false, error: "Network error. Please check your internet connection." };
    }
    if (error instanceof Error) {
      return { valid: false, error: `API error: ${error.message}` };
    }
    return { valid: false, error: `Unable to validate model: ${String(error)}` };
  }
}

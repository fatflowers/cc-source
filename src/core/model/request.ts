import { buildAttributionHeader, computeIssueHash, firstUserMessageText } from "./attribution.js";
import { ATTRIBUTION_INFO, STRUCTURED_OUTPUT_BETA } from "./constants.js";
import { getModelBetas } from "./betas.js";
import { buildMetadata } from "./metadata.js";
import { getBaseSystemPrompt } from "./systemPrompt.js";
import type { AnthropicClient, MessageParam, ModelRequestParams, SystemBlock } from "./types.js";

function normalizeSystemBlocks(system?: string | string[] | SystemBlock[]): SystemBlock[] {
  if (!system) return [];
  if (Array.isArray(system)) {
    if (system.length === 0) return [];
    if (typeof system[0] === "string") {
      return (system as string[]).map((text) => ({ type: "text", text }));
    }
    return system as SystemBlock[];
  }
  return [{ type: "text", text: system }];
}

export async function callModel(client: AnthropicClient, params: ModelRequestParams) {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    signal,
  } = params;

  const betas = [...(params.betas ?? getModelBetas(model, { provider: params.provider }))];
  if (output_format && !betas.includes(STRUCTURED_OUTPUT_BETA)) {
    betas.push(STRUCTURED_OUTPUT_BETA);
  }

  const issueHash = computeIssueHash(firstUserMessageText(messages), ATTRIBUTION_INFO.VERSION);
  const attributionHeader = buildAttributionHeader({
    messages,
    issueHash,
  });

  const baseSystemPrompt = getBaseSystemPrompt({
    provider: params.provider ?? "default",
    isNonInteractive: params.isNonInteractive ?? false,
    hasAppendSystemPrompt: params.hasAppendSystemPrompt ?? false,
  });

  const systemBlocks: SystemBlock[] = [
    attributionHeader ? { type: "text", text: attributionHeader } : null,
    { type: "text", text: baseSystemPrompt },
    ...normalizeSystemBlocks(system),
  ].filter((block): block is SystemBlock => block !== null);

  const request: Record<string, unknown> = {
    model,
    max_tokens,
    system: systemBlocks,
    messages: messages as MessageParam[],
  };

  if (tools && tools.length > 0) request.tools = tools;
  if (tool_choice) request.tool_choice = tool_choice;
  if (output_format) request.output_config = { format: output_format };
  if (betas.length > 0) request.betas = betas;
  request.metadata = params.metadata ?? buildMetadata();

  return client.beta.messages.create(request, { signal });
}

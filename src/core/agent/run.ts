import { AgentRuntime } from "./runtime.js";
import type { AgentRuntimeConfig, AgentRuntimeEvent, AgentSubmitOptions } from "./types.js";

export interface RunAgentSessionInput extends AgentRuntimeConfig {
  prompt: string;
  promptUuid?: string;
}

export async function* runAgentSession(
  input: RunAgentSessionInput
): AsyncGenerator<AgentRuntimeEvent> {
  const runtime = new AgentRuntime(input);
  const submit: AgentSubmitOptions = input.promptUuid ? { uuid: input.promptUuid } : {};
  yield* runtime.submitMessage(input.prompt, submit);
}

import { AgentRuntime } from "./runtime.js";
import type { TeamMailbox } from "./mailbox.js";
import { parseTeamControlMessage, formatShutdownApproved } from "./protocol.js";
import type { AgentIdentity, AgentRuntimeEvent, TeamMailboxMessage } from "./types.js";

export interface InProcessRunnerConfig {
  identity: AgentIdentity & { agentId: string };
  runtime: AgentRuntime;
  mailbox: TeamMailbox;
  pollIntervalMs?: number;
  autoApproveShutdown?: boolean;
  now?: () => number;
}

export interface InProcessWaitResult {
  type: "new_message" | "shutdown_request" | "aborted";
  message?: TeamMailboxMessage;
}

export class InProcessTeammateRunner {
  private readonly cfg: InProcessRunnerConfig;
  private readonly pollIntervalMs: number;
  private stopped = false;

  constructor(config: InProcessRunnerConfig) {
    this.cfg = config;
    this.pollIntervalMs = config.pollIntervalMs ?? 500;
  }

  async *run(initialPrompt: string): AsyncGenerator<AgentRuntimeEvent> {
    yield* this.cfg.runtime.submitMessage(initialPrompt);

    while (!this.stopped) {
      const next = await this.waitForNextMessage();
      if (next.type === "aborted") return;
      if (!next.message) continue;

      if (next.type === "shutdown_request") {
        if (this.cfg.autoApproveShutdown) {
          const from = next.message.from ?? "unknown";
          this.cfg.mailbox.send({
            kind: "shutdown_approved",
            text: formatShutdownApproved(this.cfg.identity.agentName ?? this.cfg.identity.agentId),
            from: this.cfg.identity.agentName ?? this.cfg.identity.agentId,
            to: from,
            metadata: {
              sourceMessageId: next.message.id,
              agentId: this.cfg.identity.agentId,
            },
          });
          this.stopped = true;
        }

        yield {
          type: "system",
          subtype: "shutdown_request",
          session_id: this.cfg.runtime.getSessionId(),
          uuid: next.message.id,
          from: next.message.from,
          reason: next.message.metadata?.reason,
        };
        if (this.stopped) return;
        continue;
      }

      if (next.message.kind === "task_notification") {
        yield {
          type: "system",
          subtype: "task_notification",
          session_id: this.cfg.runtime.getSessionId(),
          uuid: next.message.id,
          summary: next.message.text,
          ...next.message.metadata,
        };
        continue;
      }

      const prompt = next.message.text;
      yield* this.cfg.runtime.submitMessage(prompt, { uuid: next.message.id });
    }
  }

  stop() {
    this.stopped = true;
    this.cfg.runtime.interrupt();
  }

  enqueueUserMessage(message: string, from?: string, metadata?: Record<string, unknown>) {
    return this.cfg.mailbox.send({
      kind: "user",
      text: message,
      from,
      to: this.cfg.identity.agentId,
      metadata,
    });
  }

  requestShutdown(from: string, reason?: string) {
    return this.cfg.mailbox.send({
      kind: "shutdown_request",
      text: `<shutdown_request from="${from}"${reason ? ` reason="${reason}"` : ""} />`,
      from,
      to: this.cfg.identity.agentId,
      metadata: { reason },
    });
  }

  private async waitForNextMessage(): Promise<InProcessWaitResult> {
    while (!this.stopped) {
      const next = this.cfg.mailbox.dequeue(this.cfg.identity.agentId);
      if (!next) {
        await delay(this.pollIntervalMs);
        continue;
      }

      if (next.kind === "shutdown_request") {
        return { type: "shutdown_request", message: next };
      }

      if (next.kind === "user") {
        const control = parseTeamControlMessage(next.text);
        if (control?.type === "shutdown_request") {
          return {
            type: "shutdown_request",
            message: {
              ...next,
              metadata: {
                ...next.metadata,
                reason: control.payload.reason,
              },
            },
          };
        }
      }

      return { type: "new_message", message: next };
    }
    return { type: "aborted" };
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

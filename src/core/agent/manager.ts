import { InMemoryTeamMailbox } from "./mailbox.js";
import { InProcessTeammateRunner } from "./inProcessRunner.js";
import { AgentRuntime } from "./runtime.js";
import type { TeamMailbox } from "./mailbox.js";
import type { AgentIdentity, AgentRuntimeConfig } from "./types.js";

export interface CreateTeammateConfig {
  identity: AgentIdentity & { agentId: string };
  runtime: AgentRuntimeConfig;
  autoApproveShutdown?: boolean;
  pollIntervalMs?: number;
}

export class AgentTeamManager {
  private readonly mailbox: TeamMailbox;
  private readonly runners = new Map<string, InProcessTeammateRunner>();

  constructor(mailbox: TeamMailbox = new InMemoryTeamMailbox()) {
    this.mailbox = mailbox;
  }

  createInProcessTeammate(config: CreateTeammateConfig) {
    const runtime = new AgentRuntime({
      ...config.runtime,
      identity: config.identity,
    });
    const runner = new InProcessTeammateRunner({
      identity: config.identity,
      runtime,
      mailbox: this.mailbox,
      autoApproveShutdown: config.autoApproveShutdown,
      pollIntervalMs: config.pollIntervalMs,
    });
    this.runners.set(config.identity.agentId, runner);
    return runner;
  }

  getRunner(agentId: string) {
    return this.runners.get(agentId);
  }

  listAgents() {
    return Array.from(this.runners.keys());
  }

  send(agentId: string, message: string, from?: string, metadata?: Record<string, unknown>) {
    const runner = this.runners.get(agentId);
    if (!runner) return null;
    return runner.enqueueUserMessage(message, from, metadata);
  }

  requestShutdown(agentId: string, from: string, reason?: string) {
    const runner = this.runners.get(agentId);
    if (!runner) return null;
    return runner.requestShutdown(from, reason);
  }

  stop(agentId: string) {
    const runner = this.runners.get(agentId);
    if (!runner) return false;
    runner.stop();
    this.runners.delete(agentId);
    return true;
  }

  stopAll() {
    for (const [agentId, runner] of this.runners) {
      runner.stop();
      this.runners.delete(agentId);
    }
  }
}

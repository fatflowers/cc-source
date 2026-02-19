import { randomUUID } from "node:crypto";
import type { TeamMailboxMessage } from "./types.js";

function makeId() {
  if (typeof randomUUID === "function") return randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface TeamMailbox {
  send(message: Omit<TeamMailboxMessage, "id" | "createdAt" | "readAt">): TeamMailboxMessage;
  dequeue(agentId: string): TeamMailboxMessage | undefined;
  peek(agentId: string): TeamMailboxMessage | undefined;
  list(agentId: string, options?: { includeRead?: boolean }): TeamMailboxMessage[];
  markRead(agentId: string, messageId: string): boolean;
  clear(agentId: string): number;
}

export class InMemoryTeamMailbox implements TeamMailbox {
  private readonly entries = new Map<string, TeamMailboxMessage[]>();

  send(message: Omit<TeamMailboxMessage, "id" | "createdAt" | "readAt">): TeamMailboxMessage {
    const full: TeamMailboxMessage = {
      ...message,
      id: makeId(),
      createdAt: Date.now(),
    };
    const bucket = this.entries.get(full.to) ?? [];
    bucket.push(full);
    this.entries.set(full.to, bucket);
    return full;
  }

  dequeue(agentId: string): TeamMailboxMessage | undefined {
    const bucket = this.entries.get(agentId);
    if (!bucket || bucket.length === 0) return undefined;
    const next = bucket.find((entry) => !entry.readAt);
    if (!next) return undefined;
    next.readAt = Date.now();
    return next;
  }

  peek(agentId: string): TeamMailboxMessage | undefined {
    const bucket = this.entries.get(agentId);
    if (!bucket || bucket.length === 0) return undefined;
    return bucket.find((entry) => !entry.readAt);
  }

  list(agentId: string, options: { includeRead?: boolean } = {}): TeamMailboxMessage[] {
    const bucket = this.entries.get(agentId) ?? [];
    if (options.includeRead) return [...bucket];
    return bucket.filter((entry) => !entry.readAt);
  }

  markRead(agentId: string, messageId: string): boolean {
    const bucket = this.entries.get(agentId);
    if (!bucket) return false;
    const entry = bucket.find((item) => item.id === messageId);
    if (!entry) return false;
    if (!entry.readAt) entry.readAt = Date.now();
    return true;
  }

  clear(agentId: string): number {
    const bucket = this.entries.get(agentId);
    if (!bucket) return 0;
    this.entries.delete(agentId);
    return bucket.length;
  }
}

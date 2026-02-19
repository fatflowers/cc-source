import { resolve } from "node:path";
import { URL } from "node:url";
import type { SandboxConfig } from "./types.js";

export interface SandboxDecision {
  allowed: boolean;
  reason?: string;
  message?: string;
  blockedPath?: string;
}

export type SandboxViolation = SandboxDecision & { allowed: false };

export interface SandboxPolicyOptions {
  cwd?: string;
  allowAll?: boolean;
}

export class SandboxPolicy {
  private config: SandboxConfig | null;
  private cwd: string;
  private allowAll: boolean;

  constructor(config?: SandboxConfig | null, options?: SandboxPolicyOptions) {
    this.config = config ?? null;
    this.cwd = options?.cwd ?? process.cwd();
    this.allowAll = options?.allowAll ?? false;
  }

  checkRead(path: string): SandboxDecision {
    if (this.allowAll || !this.config?.filesystem) return { allowed: true };
    const deny = this.normalizeList(this.config.filesystem.denyRead);
    const resolved = this.resolvePath(path);
    if (this.matchesPath(resolved, deny)) {
      return { allowed: false, reason: "denyRead", blockedPath: resolved };
    }
    return { allowed: true };
  }

  checkWrite(path: string): SandboxDecision {
    if (this.allowAll || !this.config?.filesystem) return { allowed: true };
    const deny = this.normalizeList(this.config.filesystem.denyWrite);
    const allow = this.normalizeList(this.config.filesystem.allowWrite);
    const resolved = this.resolvePath(path);
    if (this.matchesPath(resolved, deny)) {
      return { allowed: false, reason: "denyWrite", blockedPath: resolved };
    }
    if (allow.length > 0 && !this.matchesPath(resolved, allow)) {
      return { allowed: false, reason: "allowWrite", blockedPath: resolved };
    }
    return { allowed: true };
  }

  checkNetwork(target: string): SandboxDecision {
    if (this.allowAll || !this.config?.network) return { allowed: true };
    const allowed = this.config.network.allowedDomains ?? [];
    const denied = this.config.network.deniedDomains ?? [];
    const hostname = this.extractHostname(target);
    if (!hostname) return { allowed: true };
    if (this.matchesDomain(hostname, denied)) {
      return { allowed: false, reason: "deniedDomain", message: `Blocked domain: ${hostname}` };
    }
    if (allowed.length > 0 && !this.matchesDomain(hostname, allowed)) {
      return { allowed: false, reason: "allowedDomains", message: `Domain not in allowlist: ${hostname}` };
    }
    return { allowed: true };
  }

  checkCommand(command: string): SandboxDecision {
    if (this.allowAll) return { allowed: true };
    if (!this.config?.ignoreViolations) return { allowed: true };
    const denied = this.config.ignoreViolations["command"] ?? [];
    if (denied.some((pattern) => command.includes(pattern))) {
      return { allowed: false, reason: "command", message: "Command blocked by sandbox" };
    }
    return { allowed: true };
  }

  private normalizeList(list: string[] | undefined) {
    if (!list) return [];
    return list.map((item) => this.resolvePath(item));
  }

  private resolvePath(input: string) {
    if (input === ".") return resolve(this.cwd);
    if (input.startsWith("/")) return resolve(input);
    return resolve(this.cwd, input);
  }

  private matchesPath(target: string, patterns: string[]) {
    for (const pattern of patterns) {
      if (target === pattern) return true;
      if (target.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`)) return true;
    }
    return false;
  }

  private extractHostname(target: string) {
    try {
      const url = target.includes("://") ? new URL(target) : new URL(`https://${target}`);
      return url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private matchesDomain(hostname: string, list: string[]) {
    const lower = hostname.toLowerCase();
    return list.some((domain) => {
      const normalized = domain.toLowerCase();
      return lower === normalized || lower.endsWith(`.${normalized}`);
    });
  }
}

export function createSandboxPolicy(config?: SandboxConfig | null, options?: SandboxPolicyOptions) {
  return new SandboxPolicy(config, options);
}

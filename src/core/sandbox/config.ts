import { resolve } from "node:path";
import type { SandboxConfig } from "./types.js";
import { parseToolRule } from "../permissions/rules.js";

export interface SettingsLike {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  sandbox?: {
    network?: SandboxConfig["network"];
    filesystem?: SandboxConfig["filesystem"];
    ignoreViolations?: SandboxConfig["ignoreViolations"];
    enableWeakerNestedSandbox?: boolean;
    ripgrep?: { command: string; args?: string[] };
    mandatoryDenySearchDepth?: number;
    allowPty?: boolean;
    seccomp?: SandboxConfig["seccomp"];
  };
}

function resolvePath(input: string, cwd: string) {
  if (input.startsWith("//")) return input.slice(1);
  if (input.startsWith("/")) return resolve(cwd, input.slice(1));
  return input;
}

export function buildSandboxConfig(settings: SettingsLike, cwd: string): SandboxConfig {
  const allowRules = settings.permissions?.allow ?? [];
  const denyRules = settings.permissions?.deny ?? [];

  const allowWrite: string[] = ["."];
  const denyWrite: string[] = [];
  const denyRead: string[] = [];
  const allowedDomains: string[] = [];
  const deniedDomains: string[] = [];

  for (const rule of allowRules) {
    const parsed = parseToolRule(rule);
    if (parsed.toolName === "WebFetch" && parsed.ruleContent?.startsWith("domain:")) {
      allowedDomains.push(parsed.ruleContent.slice("domain:".length));
    }
    if (parsed.toolName === "Edit" && parsed.ruleContent) {
      allowWrite.push(resolvePath(parsed.ruleContent, cwd));
    }
  }

  for (const rule of denyRules) {
    const parsed = parseToolRule(rule);
    if (parsed.toolName === "WebFetch" && parsed.ruleContent?.startsWith("domain:")) {
      deniedDomains.push(parsed.ruleContent.slice("domain:".length));
    }
    if (parsed.toolName === "Edit" && parsed.ruleContent) {
      denyWrite.push(resolvePath(parsed.ruleContent, cwd));
    }
    if (parsed.toolName === "Read" && parsed.ruleContent) {
      denyRead.push(resolvePath(parsed.ruleContent, cwd));
    }
  }

  return {
    network: {
      allowedDomains,
      deniedDomains,
      allowUnixSockets: settings.sandbox?.network?.allowUnixSockets,
      allowAllUnixSockets: settings.sandbox?.network?.allowAllUnixSockets,
      allowLocalBinding: settings.sandbox?.network?.allowLocalBinding,
      httpProxyPort: settings.sandbox?.network?.httpProxyPort,
      socksProxyPort: settings.sandbox?.network?.socksProxyPort,
      mitmProxy: settings.sandbox?.network?.mitmProxy,
    },
    filesystem: {
      denyRead,
      allowWrite,
      denyWrite,
      allowGitConfig: settings.sandbox?.filesystem?.allowGitConfig,
    },
    ignoreViolations: settings.sandbox?.ignoreViolations,
    enableWeakerNestedSandbox: settings.sandbox?.enableWeakerNestedSandbox,
    ripgrep: settings.sandbox?.ripgrep,
    mandatoryDenySearchDepth: settings.sandbox?.mandatoryDenySearchDepth,
    allowPty: settings.sandbox?.allowPty,
    seccomp: settings.sandbox?.seccomp,
  };
}

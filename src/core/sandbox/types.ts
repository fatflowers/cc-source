export interface SandboxNetworkConfig {
  allowedDomains?: string[];
  deniedDomains?: string[];
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  allowLocalBinding?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
  mitmProxy?: {
    socketPath: string;
    domains: string[];
  };
}

export interface SandboxFilesystemConfig {
  denyRead?: string[];
  allowWrite?: string[];
  denyWrite?: string[];
  allowGitConfig?: boolean;
}

export interface SandboxConfig {
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  ignoreViolations?: Record<string, string[]>;
  enableWeakerNestedSandbox?: boolean;
  ripgrep?: { command: string; args?: string[] };
  mandatoryDenySearchDepth?: number;
  allowPty?: boolean;
  seccomp?: { bpfPath?: string; applyPath?: string };
}

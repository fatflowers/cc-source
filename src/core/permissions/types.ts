export type PermissionMode =
  | "default"
  | "plan"
  | "acceptEdits"
  | "dontAsk"
  | "delegate"
  | "bypassPermissions";

export type PermissionBehavior = "allow" | "deny" | "ask";

export interface PermissionDecision {
  behavior: PermissionBehavior;
  message?: string;
  updatedInput?: unknown;
  decisionReason?: {
    type: string;
    reason: string;
  };
  suggestions?: Array<{ type: string; rules: ToolRule[]; behavior: PermissionBehavior; destination: string }>;
}

export interface ToolRule {
  toolName: string;
  ruleContent?: string;
}

export interface ToolPermissionContextState {
  mode: PermissionMode;
  allowRules: ToolRule[];
  denyRules: ToolRule[];
  isBypassPermissionsModeAvailable?: boolean;
}

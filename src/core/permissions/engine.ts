import type { PermissionDecision, ToolPermissionContextState } from "./types.js";
import { ToolPermissionContext } from "./context.js";
import type { SandboxPolicy, SandboxDecision, SandboxViolation } from "../sandbox/policy.js";

export interface PermissionEvaluationInput {
  toolName: string;
  input?: Record<string, unknown>;
  context?: ToolPermissionContext | ToolPermissionContextState;
  sandbox?: SandboxPolicy | null;
  blockedPath?: string;
}

export function evaluateToolPermission(params: PermissionEvaluationInput): PermissionDecision {
  const toolContext =
    params.context instanceof ToolPermissionContext
      ? params.context
      : new ToolPermissionContext(params.context ?? { mode: "default", allowRules: [], denyRules: [] });

  let decision = toolContext.decide(params.toolName, params.input);

  if (params.sandbox) {
    const violation = checkSandbox(params.sandbox, params.toolName, params.input);
    if (violation && violation.allowed === false) {
      decision = {
        behavior: "deny",
        message: violation.message ?? "Sandbox policy denied this operation",
        decisionReason: { type: "sandbox", reason: violation.reason ?? "sandbox" },
        blockedPath: violation.blockedPath,
      };
    }
  }

  if (params.blockedPath && decision.behavior !== "deny") {
    decision = {
      ...decision,
      blockedPath: params.blockedPath,
    };
  }

  return decision;
}

function checkSandbox(
  sandbox: SandboxPolicy,
  toolName: string,
  input?: Record<string, unknown>
): SandboxViolation | null {
  if (toolName === "Read" || toolName === "Edit" || toolName === "Write" || toolName === "Copy" || toolName === "Move") {
    const path = String(input?.file_path ?? input?.old_path ?? input?.path ?? "");
    if (path.length === 0) return null;
    const result = toolName === "Read" ? sandbox.checkRead(path) : sandbox.checkWrite(path);
    return toViolation(result);
  }
  if (toolName === "WebFetch" || toolName === "WebSearch") {
    const url = String(input?.url ?? input?.q ?? "");
    if (!url) return null;
    const result = sandbox.checkNetwork(url);
    return toViolation(result);
  }
  return null;
}

function toViolation(decision: SandboxDecision): SandboxViolation | null {
  if (decision.allowed) return null;
  return {
    allowed: false,
    reason: decision.reason,
    message: decision.message,
    blockedPath: decision.blockedPath,
  };
}

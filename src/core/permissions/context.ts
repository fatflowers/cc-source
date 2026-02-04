import type { PermissionDecision, ToolPermissionContextState, ToolRule } from "./types.js";
import { ruleApplies } from "./rules.js";

export class ToolPermissionContext {
  private state: ToolPermissionContextState;

  constructor(state?: Partial<ToolPermissionContextState>) {
    this.state = {
      mode: state?.mode ?? "default",
      allowRules: state?.allowRules ?? [],
      denyRules: state?.denyRules ?? [],
      isBypassPermissionsModeAvailable: state?.isBypassPermissionsModeAvailable,
    };
  }

  get mode() {
    return this.state.mode;
  }

  set mode(mode: ToolPermissionContextState["mode"]) {
    this.state.mode = mode;
  }

  updateRules({ allowRules, denyRules }: { allowRules?: ToolRule[]; denyRules?: ToolRule[] }) {
    if (allowRules) this.state.allowRules = allowRules;
    if (denyRules) this.state.denyRules = denyRules;
  }

  decide(toolName: string, input?: Record<string, unknown>): PermissionDecision {
    if (this.state.mode === "bypassPermissions") {
      return { behavior: "allow", decisionReason: { type: "mode", reason: "bypassPermissions" } };
    }

    const deny = this.state.denyRules.find((rule) => ruleApplies(toolName, rule, input));
    if (deny) {
      return { behavior: "deny", decisionReason: { type: "rule", reason: "deny" } };
    }

    const allow = this.state.allowRules.find((rule) => ruleApplies(toolName, rule, input));
    if (allow) {
      return { behavior: "allow", decisionReason: { type: "rule", reason: "allow" } };
    }

    if (this.state.mode === "acceptEdits") {
      return { behavior: "allow", decisionReason: { type: "mode", reason: "acceptEdits" } };
    }

    if (this.state.mode === "dontAsk") {
      return { behavior: "deny", decisionReason: { type: "mode", reason: "dontAsk" } };
    }

    if (this.state.mode === "plan" || this.state.mode === "delegate") {
      return { behavior: "ask", decisionReason: { type: "mode", reason: this.state.mode } };
    }

    return { behavior: "ask", decisionReason: { type: "mode", reason: "default" } };
  }
}

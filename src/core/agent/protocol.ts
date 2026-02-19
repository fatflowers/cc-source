export interface ShutdownRequestPayload {
  from: string;
  reason?: string;
}

export interface ShutdownApprovedPayload {
  from: string;
}

export type TeamControlPayload =
  | { type: "shutdown_request"; payload: ShutdownRequestPayload }
  | { type: "shutdown_approved"; payload: ShutdownApprovedPayload };

const SHUTDOWN_REQUEST_RE =
  /^<shutdown_request(?:\s+from="([^"]+)")?(?:\s+reason="([^"]*)")?\s*\/?>$/i;
const SHUTDOWN_APPROVED_RE = /^<shutdown_approved(?:\s+from="([^"]+)")?\s*\/?>$/i;

export function parseTeamControlMessage(text: string): TeamControlPayload | null {
  const trimmed = text.trim();
  const requestMatch = trimmed.match(SHUTDOWN_REQUEST_RE);
  if (requestMatch) {
    return {
      type: "shutdown_request",
      payload: {
        from: requestMatch[1] ?? "unknown",
        reason: requestMatch[2] || undefined,
      },
    };
  }

  const approvedMatch = trimmed.match(SHUTDOWN_APPROVED_RE);
  if (approvedMatch) {
    return {
      type: "shutdown_approved",
      payload: {
        from: approvedMatch[1] ?? "unknown",
      },
    };
  }

  return null;
}

export function formatShutdownRequest(from: string, reason?: string) {
  if (!reason) return `<shutdown_request from="${escapeAttr(from)}" />`;
  return `<shutdown_request from="${escapeAttr(from)}" reason="${escapeAttr(reason)}" />`;
}

export function formatShutdownApproved(from: string) {
  return `<shutdown_approved from="${escapeAttr(from)}" />`;
}

function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
}

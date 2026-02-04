export interface MetadataOptions {
  userId?: string;
  accountUuid?: string;
  sessionId?: string;
}

export function buildMetadata(options: MetadataOptions = {}) {
  const user = options.userId ?? process.env.CLAUDE_CODE_USER_ID ?? process.env.USER ?? "unknown";
  const account = options.accountUuid ?? process.env.CLAUDE_CODE_ACCOUNT_UUID ?? "";
  const session = options.sessionId ?? process.env.CLAUDE_CODE_SESSION_ID ?? "";
  return {
    user_id: `user_${user}_account_${account}_session_${session}`,
  };
}

export const ATTRIBUTION_INFO = {
  ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues",
  PACKAGE_URL: "@anthropic-ai/claude-code",
  README_URL: "https://code.claude.com/docs/en/overview",
  VERSION: "2.1.29",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
  BUILD_TIME: "2026-01-31T20:12:07Z",
} as const;

export const ISSUE_HASH_SALT = "59cf53e54c78";

export const STRUCTURED_OUTPUT_BETA = "structured-outputs-2025-12-15";

export const DEFAULT_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT ?? "unknown";

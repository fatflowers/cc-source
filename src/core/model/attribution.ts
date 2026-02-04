import { createHash } from "node:crypto";
import {
  ATTRIBUTION_INFO,
  DEFAULT_ENTRYPOINT,
  ISSUE_HASH_SALT,
} from "./constants.js";
import type { MessageParam } from "./types.js";

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function firstUserMessageText(messages: MessageParam[]): string {
  const first = messages.find((msg) => msg.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content;
  const textBlock = first.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

export function computeIssueHash(userText: string, version: string = ATTRIBUTION_INFO.VERSION): string {
  const indices = [4, 7, 20];
  const key = indices.map((index) => userText[index] || "0").join("");
  const payload = `${ISSUE_HASH_SALT}${key}${version}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 3);
}

export function shouldAddAttributionHeader(explicitSetting?: boolean): boolean {
  if (isTruthy(process.env.CLAUDE_CODE_ATTRIBUTION_HEADER)) return false;
  if (explicitSetting === undefined) return true;
  return explicitSetting;
}

export function buildAttributionHeader(options: {
  messages?: MessageParam[];
  issueHash?: string;
  entrypoint?: string;
  enabled?: boolean;
  version?: string;
} = {}): string {
  if (!shouldAddAttributionHeader(options.enabled)) return "";

  const version = options.version ?? ATTRIBUTION_INFO.VERSION;
  const issueHash =
    options.issueHash ??
    (options.messages ? computeIssueHash(firstUserMessageText(options.messages), version) : "");

  const entrypoint = options.entrypoint ?? DEFAULT_ENTRYPOINT;
  const versionTag = `${version}.${issueHash}`;
  return `x-anthropic-billing-header: cc_version=${versionTag}; cc_entrypoint=${entrypoint};`;
}

export function attributionInfo() {
  return ATTRIBUTION_INFO;
}

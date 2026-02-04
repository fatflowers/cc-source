import { callModel } from "../model/request.js";
import type { AnthropicClient } from "../model/types.js";
import { LruCache } from "./lruCache.js";

export const WEB_FETCH_TOOL_NAME = "WebFetch";

export const WEB_FETCH_DESCRIPTION = `
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
  - For GitHub URLs, prefer using the gh CLI via Bash instead (e.g., gh pr view, gh issue view, gh api).
`;

export const WEB_FETCH_CACHE_TTL_MS = 900000;
export const WEB_FETCH_CACHE_MAX_BYTES = 52428800;
export const WEB_FETCH_MAX_URL_LENGTH = 2000;
export const WEB_FETCH_MAX_CONTENT_BYTES = 10485760;
export const WEB_FETCH_MAX_PROMPT_CHARS = 100000;

export const WEB_FETCH_PREAPPROVED_DOMAINS = new Set([
  "platform.claude.com",
  "code.claude.com",
  "modelcontextprotocol.io",
  "github.com/anthropics",
  "agentskills.io",
  "docs.python.org",
  "en.cppreference.com",
  "docs.oracle.com",
  "learn.microsoft.com",
  "developer.mozilla.org",
  "go.dev",
  "pkg.go.dev",
  "www.php.net",
  "docs.swift.org",
  "kotlinlang.org",
  "ruby-doc.org",
  "doc.rust-lang.org",
  "www.typescriptlang.org",
  "react.dev",
  "angular.io",
  "vuejs.org",
  "nextjs.org",
  "expressjs.com",
  "nodejs.org",
  "bun.sh",
  "jquery.com",
  "getbootstrap.com",
  "tailwindcss.com",
  "d3js.org",
  "threejs.org",
  "redux.js.org",
  "webpack.js.org",
  "jestjs.io",
  "reactrouter.com",
  "docs.djangoproject.com",
  "flask.palletsprojects.com",
  "fastapi.tiangolo.com",
  "pandas.pydata.org",
  "numpy.org",
  "www.tensorflow.org",
  "pytorch.org",
  "scikit-learn.org",
  "matplotlib.org",
  "requests.readthedocs.io",
  "jupyter.org",
  "laravel.com",
  "symfony.com",
  "wordpress.org",
  "docs.spring.io",
  "hibernate.org",
  "tomcat.apache.org",
  "gradle.org",
  "maven.apache.org",
  "asp.net",
  "dotnet.microsoft.com",
  "nuget.org",
  "blazor.net",
  "reactnative.dev",
  "docs.flutter.dev",
  "developer.apple.com",
  "developer.android.com",
  "keras.io",
  "spark.apache.org",
  "huggingface.co",
  "www.kaggle.com",
  "www.mongodb.com",
  "redis.io",
  "www.postgresql.org",
  "dev.mysql.com",
  "www.sqlite.org",
  "graphql.org",
  "prisma.io",
  "docs.aws.amazon.com",
  "cloud.google.com",
  "learn.microsoft.com",
  "kubernetes.io",
  "www.docker.com",
  "www.terraform.io",
  "www.ansible.com",
  "vercel.com/docs",
  "docs.netlify.com",
  "devcenter.heroku.com/",
  "cypress.io",
  "selenium.dev",
  "docs.unity.com",
  "docs.unrealengine.com",
  "git-scm.com",
  "nginx.org",
  "httpd.apache.org",
]);

export interface WebFetchInput {
  url: string;
  prompt: string;
}

export interface WebFetchContent {
  bytes: number;
  code: number;
  codeText: string;
  content: string;
  contentType: string;
}

export interface WebFetchRedirect {
  type: "redirect";
  originalUrl: string;
  redirectUrl: string;
  statusCode: number;
}

export interface WebFetchOutput {
  bytes: number;
  code: number;
  codeText: string;
  result: string;
  durationMs: number;
  url: string;
}

export class DomainBlockedError extends Error {
  constructor(domain: string) {
    super(`Claude Code is unable to fetch from ${domain}`);
    this.name = "DomainBlockedError";
  }
}

export class DomainCheckFailedError extends Error {
  constructor(domain: string) {
    super(
      `Unable to verify if domain ${domain} is safe to fetch. This may be due to network restrictions or enterprise security policies blocking claude.ai.`
    );
    this.name = "DomainCheckFailedError";
  }
}

export function buildWebFetchPrompt(content: string, prompt: string, safeQuotes: boolean): string {
  return `
Web page content:
---
${content}
---

${prompt}

${
    safeQuotes
      ? "Provide a concise response based on the content above. Include relevant details, code examples, and documentation excerpts as needed."
      : `Provide a concise response based only on the content above. In your response:
 - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
 - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
 - You are not a lawyer and never comment on the legality of your own prompts and responses.
 - Never produce or reproduce exact song lyrics.`
  }
`;
}

export function isValidWebFetchUrl(url: string): boolean {
  if (url.length > WEB_FETCH_MAX_URL_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.hostname.split(".").length < 2) return false;
  return true;
}

export function isPreapprovedWebFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathname = parsed.pathname;
    for (const entry of WEB_FETCH_PREAPPROVED_DOMAINS) {
      if (entry.includes("/")) {
        const [host, ...rest] = entry.split("/");
        const prefix = `/${rest.join("/")}`;
        if (hostname === host && pathname.startsWith(prefix)) return true;
      } else if (hostname === entry) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export type DomainInfoResult =
  | { status: "allowed" }
  | { status: "blocked" }
  | { status: "check_failed"; error: Error };

export async function checkDomainInfo(domain: string, fetcher: typeof fetch = fetch): Promise<DomainInfoResult> {
  try {
    const response = await fetcher(
      `https://api.anthropic.com/api/web/domain_info?domain=${encodeURIComponent(domain)}`
    );
    if (response.status === 200) {
      const data = (await response.json()) as { can_fetch?: boolean };
      return data.can_fetch === true ? { status: "allowed" } : { status: "blocked" };
    }
    return { status: "check_failed", error: new Error(`Domain check returned status ${response.status}`) };
  } catch (error) {
    return {
      status: "check_failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function isAllowedRedirect(originalUrl: string, redirectUrl: string): boolean {
  try {
    const original = new URL(originalUrl);
    const redirect = new URL(redirectUrl);
    if (redirect.protocol !== original.protocol) return false;
    if (redirect.port !== original.port) return false;
    if (redirect.username || redirect.password) return false;

    const normalize = (host: string) => host.replace(/^www\./, "");
    return normalize(original.hostname) === normalize(redirect.hostname);
  } catch {
    return false;
  }
}

async function fetchWithRedirects(
  url: string,
  signal: AbortSignal | undefined,
  allowRedirect: (original: string, redirect: string) => boolean,
  fetcher: typeof fetch
): Promise<Response | WebFetchRedirect> {
  const response = await fetcher(url, {
    signal,
    redirect: "manual",
    headers: { Accept: "text/markdown, text/html, */*" },
  });

  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect missing Location header");
    const redirectUrl = new URL(location, url).toString();
    if (allowRedirect(url, redirectUrl)) {
      return fetchWithRedirects(redirectUrl, signal, allowRedirect, fetcher);
    }
    return { type: "redirect", originalUrl: url, redirectUrl, statusCode: response.status };
  }

  return response;
}

async function convertHtmlToMarkdown(html: string): Promise<string> {
  try {
    const mod = await import("turndown");
    const TurndownService = mod.default ?? (mod as unknown as { default: new () => { turndown: (v: string) => string } }).default;
    if (!TurndownService) return html;
    const service = new TurndownService();
    return service.turndown(html);
  } catch {
    return html;
  }
}

export interface WebFetchCacheEntry extends WebFetchContent {
  url: string;
}

export const webFetchCache = new LruCache<string, WebFetchCacheEntry>({
  maxSize: WEB_FETCH_CACHE_MAX_BYTES,
  sizeCalculation: (entry) => Buffer.byteLength(entry.content),
  ttl: WEB_FETCH_CACHE_TTL_MS,
});

export interface FetchWebContentOptions {
  signal?: AbortSignal;
  skipPreflight?: boolean;
  fetcher?: typeof fetch;
  cache?: LruCache<string, WebFetchCacheEntry>;
}

export async function fetchWebContent(
  url: string,
  options: FetchWebContentOptions = {}
): Promise<WebFetchContent | WebFetchRedirect> {
  if (!isValidWebFetchUrl(url)) throw new Error("Invalid URL");

  const cache = options.cache ?? webFetchCache;
  const cached = cache.get(url);
  if (cached) {
    return {
      bytes: cached.bytes,
      code: cached.code,
      codeText: cached.codeText,
      content: cached.content,
      contentType: cached.contentType,
    };
  }

  let normalizedUrl = url;
  const parsed = new URL(url);
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
    normalizedUrl = parsed.toString();
  }

  if (!options.skipPreflight) {
    const domainResult = await checkDomainInfo(parsed.hostname, options.fetcher ?? fetch);
    if (domainResult.status === "blocked") throw new DomainBlockedError(parsed.hostname);
    if (domainResult.status === "check_failed") throw new DomainCheckFailedError(parsed.hostname);
  }

  const response = await fetchWithRedirects(
    normalizedUrl,
    options.signal,
    isAllowedRedirect,
    options.fetcher ?? fetch
  );

  if ((response as WebFetchRedirect).type === "redirect") {
    return response as WebFetchRedirect;
  }

  const httpResponse = response as Response;
  const data = await httpResponse.arrayBuffer();
  const buffer = Buffer.from(data);
  const contentType = httpResponse.headers.get("content-type") ?? "";
  const raw = buffer.toString("utf-8");
  const bytes = buffer.byteLength;

  const content = contentType.includes("text/html") ? await convertHtmlToMarkdown(raw) : raw;

  const entry: WebFetchCacheEntry = {
    url,
    bytes,
    code: httpResponse.status,
    codeText: httpResponse.statusText,
    content,
    contentType,
  };
  cache.set(url, entry);

  return {
    bytes,
    code: httpResponse.status,
    codeText: httpResponse.statusText,
    content,
    contentType,
  };
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[Content truncated due to length...]`;
}

export interface ApplyWebFetchPromptOptions {
  client: AnthropicClient;
  model: string;
  signal?: AbortSignal;
  safeQuotes?: boolean;
  maxPromptChars?: number;
}

export async function applyWebFetchPrompt(
  content: string,
  prompt: string,
  options: ApplyWebFetchPromptOptions
): Promise<string> {
  const maxChars = options.maxPromptChars ?? WEB_FETCH_MAX_PROMPT_CHARS;
  const truncated = truncateContent(content, maxChars);
  const userPrompt = buildWebFetchPrompt(truncated, prompt, Boolean(options.safeQuotes));

  const response = await callModel(options.client, {
    model: options.model,
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
    signal: options.signal,
  });

  const blocks = response?.content ?? [];
  if (Array.isArray(blocks) && blocks.length > 0) {
    const first = blocks[0] as { type?: string; text?: string };
    if (first && typeof first.text === "string") return first.text;
  }
  return "No response from model";
}

export interface RunWebFetchOptions {
  client: AnthropicClient;
  model: string;
  signal?: AbortSignal;
  skipPreflight?: boolean;
  fetcher?: typeof fetch;
}

export async function runWebFetch(
  input: WebFetchInput,
  options: RunWebFetchOptions
): Promise<WebFetchOutput | WebFetchRedirect> {
  const start = performance.now();
  const contentResult = await fetchWebContent(input.url, {
    signal: options.signal,
    skipPreflight: options.skipPreflight,
    fetcher: options.fetcher,
  });

  if ((contentResult as WebFetchRedirect).type === "redirect") {
    return contentResult as WebFetchRedirect;
  }

  const content = contentResult as WebFetchContent;
  const result = await applyWebFetchPrompt(content.content, input.prompt, {
    client: options.client,
    model: options.model,
    signal: options.signal,
  });

  return {
    bytes: content.bytes,
    code: content.code,
    codeText: content.codeText,
    result,
    durationMs: performance.now() - start,
    url: input.url,
  };
}

export function formatWebFetchDescription(input: WebFetchInput, verbose: boolean): string | null {
  if (!input?.url) return null;
  if (verbose) {
    return `url: "${input.url}"${verbose && input.prompt ? `, prompt: "${input.prompt}"` : ""}`;
  }
  return input.url;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

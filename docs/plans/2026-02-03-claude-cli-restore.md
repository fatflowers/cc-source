# Claude CLI Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recreate a TypeScript codebase and directory structure that mirrors `cli.js` behavior 1:1, while pulling third-party code into `package.json` dependencies instead of bundling it.

**Architecture:** Use a standard ESM CLI layout with `bin/claude.ts` as the entrypoint, `src/cli` for argument parsing and command wiring, `src/commands` for subcommands, `src/core` and `src/io` for runtime utilities, and `src/legacy` as a bridge to bundle-only logic during restoration.

**Tech Stack:** Node.js ESM, TypeScript, Commander (CLI surface), small Node scripts for extraction.

---

**Note:** This directory is not a git repo (`.git` is missing). The commit steps below will fail until you initialize git. If you want commits, run `git init` first.

### Task 1: Capture Baseline Fixtures and Add a Wrapper CLI

**Files:**
- Create: `tests/fixtures/help.txt`
- Create: `tests/fixtures/version.txt`
- Create: `tests/smoke/cli-help.test.mjs`
- Create: `tests/smoke/cli-version.test.mjs`
- Create: `bin/claude.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-help.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("bin/claude.ts");
const expected = readFileSync("tests/fixtures/help.txt", "utf8");
const actual = execFileSync("node", [bin, "--help"], { encoding: "utf8" });

if (actual.trim() !== expected.trim()) {
  throw new Error("help output mismatch");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-help.test.mjs`
Expected: FAIL with "ENOENT" or "Cannot find module" because `bin/claude.ts` and fixtures do not exist yet.

**Step 3: Write minimal implementation**

```ts
// bin/claude.ts
#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const legacyBin = resolve(here, "..", "cli.js");

const result = spawnSync(process.execPath, [legacyBin, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
```

Then generate fixtures:
- Run: `node cli.js --help > tests/fixtures/help.txt`
- Run: `node cli.js --version > tests/fixtures/version.txt`

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-help.test.mjs`
Expected: PASS (no output, exit code 0).

**Step 5: Commit**

```bash
git add bin/claude.ts tests/fixtures/help.txt tests/fixtures/version.txt tests/smoke/cli-help.test.mjs
git commit -m "test: add help fixture and wrapper cli"
```
Expected (currently): FAIL with "not a git repository" until git is initialized.

---

### Task 2: Add Project Scaffolding for TypeScript ESM CLI

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/cli/run.ts`
- Create: `src/cli/definition.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-version.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("bin/claude.ts");
const expected = readFileSync("tests/fixtures/version.txt", "utf8");
const actual = execFileSync("node", [bin, "--version"], { encoding: "utf8" });

if (actual.trim() !== expected.trim()) {
  throw new Error("version output mismatch");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-version.test.mjs`
Expected: FAIL (fixtures exist but wrapper does not yet define project scaffolding; OK to fail until next steps are done).

**Step 3: Write minimal implementation**

```json
// package.json
{
  "name": "claude-cli-restored",
  "private": true,
  "type": "module",
  "bin": {
    "claude": "bin/claude.ts"
  },
  "scripts": {
    "test:help": "node tests/smoke/cli-help.test.mjs",
    "test:version": "node tests/smoke/cli-version.test.mjs"
  },
  "dependencies": {
    "commander": "^11.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "bin"]
}
```

```ts
// src/cli/definition.ts
import { Command } from "commander";

export function createProgram() {
  const program = new Command();
  program
    .name("claude")
    .description(
      "Claude Code - starts an interactive session by default, use -p/--print for\n" +
        "non-interactive output"
    )
    .argument("[prompt]", "Your prompt")
    .option("--add-dir <directories...>", "Additional directories to allow tool access to")
    .option("--agent <agent>", "Agent for the current session. Overrides the 'agent' setting.")
    .option(
      "--agents <json>",
      "JSON object defining custom agents (e.g. '{\"reviewer\": {\"description\": \"Reviews code\", \"prompt\": \"You are a code reviewer\"}}')"
    )
    .option(
      "--allow-dangerously-skip-permissions",
      "Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access."
    )
    .option(
      "--allowedTools, --allowed-tools <tools...>",
      "Comma or space-separated list of tool names to allow (e.g. \"Bash(git:*) Edit\")"
    )
    .option("--append-system-prompt <prompt>", "Append a system prompt to the default system prompt")
    .option("--betas <betas...>", "Beta headers to include in API requests (API key users only)")
    .option("--chrome", "Enable Claude in Chrome integration")
    .option("-c, --continue", "Continue the most recent conversation in the current directory")
    .option(
      "--dangerously-skip-permissions",
      "Bypass all permission checks. Recommended only for sandboxes with no internet access."
    )
    .option("-d, --debug [filter]", "Enable debug mode with optional category filtering (e.g., \"api,hooks\" or \"!statsig,!file\")")
    .option("--debug-file <path>", "Write debug logs to a specific file path (implicitly enables debug mode)")
    .option("--disable-slash-commands", "Disable all skills")
    .option(
      "--disallowedTools, --disallowed-tools <tools...>",
      "Comma or space-separated list of tool names to deny (e.g. \"Bash(git:*) Edit\")"
    )
    .option(
      "--fallback-model <model>",
      "Enable automatic fallback to specified model when default model is overloaded (only works with --print)"
    )
    .option(
      "--file <specs...>",
      "File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)"
    )
    .option(
      "--fork-session",
      "When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)"
    )
    .option(
      "--from-pr [value]",
      "Resume a session linked to a PR by PR number/URL, or open interactive picker with optional search term"
    )
    .option("-h, --help", "Display help for command")
    .option("--ide", "Automatically connect to IDE on startup if exactly one valid IDE is available")
    .option(
      "--include-partial-messages",
      "Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)"
    )
    .option(
      "--input-format <format>",
      "Input format (only works with --print): \"text\" (default), or \"stream-json\" (realtime streaming input)"
    )
    .option(
      "--json-schema <schema>",
      "JSON Schema for structured output validation. Example: {\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}"
    )
    .option("--max-budget-usd <amount>", "Maximum dollar amount to spend on API calls (only works with --print)")
    .option("--mcp-config <configs...>", "Load MCP servers from JSON files or strings (space-separated)")
    .option("--mcp-debug", "[DEPRECATED. Use --debug instead] Enable MCP debug mode (shows MCP server errors)")
    .option(
      "--model <model>",
      "Model for the current session. Provide an alias for the latest model (e.g. 'sonnet' or 'opus') or a model's full name (e.g. 'claude-sonnet-4-5-20250929')."
    )
    .option("--no-chrome", "Disable Claude in Chrome integration")
    .option(
      "--no-session-persistence",
      "Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)"
    )
    .option(
      "--output-format <format>",
      "Output format (only works with --print): \"text\" (default), \"json\" (single result), or \"stream-json\" (realtime streaming)"
    )
    .option(
      "--permission-mode <mode>",
      "Permission mode to use for the session (choices: \"acceptEdits\", \"bypassPermissions\", \"default\", \"delegate\", \"dontAsk\", \"plan\")"
    )
    .option("--plugin-dir <paths...>", "Load plugins from directories for this session only (repeatable)")
    .option(
      "-p, --print",
      "Print response and exit (useful for pipes). Note: The workspace trust dialog is skipped when Claude is run with the -p mode. Only use this flag in directories you trust."
    )
    .option(
      "--replay-user-messages",
      "Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)"
    )
    .option(
      "-r, --resume [value]",
      "Resume a conversation by session ID, or open interactive picker with optional search term"
    )
    .option("--session-id <uuid>", "Use a specific session ID for the conversation (must be a valid UUID)")
    .option(
      "--setting-sources <sources>",
      "Comma-separated list of setting sources to load (user, project, local)."
    )
    .option("--settings <file-or-json>", "Path to a settings JSON file or a JSON string to load additional settings from")
    .option(
      "--strict-mcp-config",
      "Only use MCP servers from --mcp-config, ignoring all other MCP configurations"
    )
    .option("--system-prompt <prompt>", "System prompt to use for the session")
    .option(
      "--tools <tools...>",
      "Specify the list of available tools from the built-in set. Use \"\" to disable all tools, \"default\" to use all tools, or specify tool names (e.g. \"Bash,Edit,Read\")."
    )
    .option("--verbose", "Override verbose mode setting from config")
    .option("-v, --version", "Output the version number");

  program
    .command("doctor")
    .description("Check the health of your Claude Code auto-updater");
  program
    .command("install [target]")
    .description("Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)");
  program.command("mcp").description("Configure and manage MCP servers");
  program.command("plugin").description("Manage Claude Code plugins");
  program
    .command("setup-token")
    .description("Set up a long-lived authentication token (requires Claude subscription)");
  program.command("update").description("Check for updates and install if available");

  return program;
}
```

```ts
// src/cli/run.ts
import { createProgram } from "./definition.js";

export async function runCli(argv: string[]) {
  const program = createProgram();
  program.exitOverride();
  await program.parseAsync(argv, { from: "user" });
}
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-version.test.mjs`
Expected: PASS (the wrapper still delegates to `cli.js`, so output matches fixtures).

**Step 5: Commit**

```bash
git add package.json tsconfig.json src/cli/definition.ts src/cli/run.ts tests/smoke/cli-version.test.mjs
git commit -m "chore: add ts scaffolding and cli definition"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 3: Add Dependency Discovery Script

**Files:**
- Create: `scripts/extract-deps.mjs`
- Create: `docs/deps/third-party.txt`
- Create: `docs/deps/node-builtins.txt`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-deps.test.mjs
import { readFileSync } from "node:fs";

const third = readFileSync("docs/deps/third-party.txt", "utf8").trim();
if (!third.includes("ajv")) {
  throw new Error("expected ajv in third-party deps");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-deps.test.mjs`
Expected: FAIL because `docs/deps/third-party.txt` does not exist yet.

**Step 3: Write minimal implementation**

```js
// scripts/extract-deps.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const text = readFileSync("cli.js", "utf8");
const requireRe = /require\(['"]([^'"]+)['"]\)/g;
const importRe = /import(?:[^'\"]+from\s*)?['\"]([^'\"]+)['\"]/g;

const deps = new Set();
const builtins = new Set();

for (const re of [requireRe, importRe]) {
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (spec.startsWith("node:")) builtins.add(spec);
    else if (!spec.startsWith(".")) deps.add(spec.split("/")[0].startsWith("@") ? spec.split("/").slice(0,2).join("/") : spec.split("/")[0]);
  }
}

mkdirSync(resolve("docs", "deps"), { recursive: true });
writeFileSync(resolve("docs", "deps", "third-party.txt"), Array.from(deps).sort().join("\n") + "\n");
writeFileSync(resolve("docs", "deps", "node-builtins.txt"), Array.from(builtins).sort().join("\n") + "\n");
```

Then run:
- `node scripts/extract-deps.mjs`

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-deps.test.mjs`
Expected: PASS, and `docs/deps/third-party.txt` includes `ajv`.

**Step 5: Commit**

```bash
git add scripts/extract-deps.mjs docs/deps/third-party.txt docs/deps/node-builtins.txt tests/smoke/cli-deps.test.mjs
git commit -m "chore: add dependency extraction tooling"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 4: Add Core Types and Context Skeleton

**Files:**
- Create: `src/core/context.ts`
- Create: `src/io/logger.ts`
- Create: `src/commands/doctor.ts`
- Create: `src/commands/install.ts`
- Create: `src/commands/mcp.ts`
- Create: `src/commands/plugin.ts`
- Create: `src/commands/setup-token.ts`
- Create: `src/commands/update.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-context.test.mjs
import { readFileSync } from "node:fs";

const text = readFileSync("src/core/context.ts", "utf8");
if (!text.includes("export interface CliContext")) {
  throw new Error("CliContext interface missing");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-context.test.mjs`
Expected: FAIL because `src/core/context.ts` does not exist yet.

**Step 3: Write minimal implementation**

```ts
// src/core/context.ts
export interface CliContext {
  cwd: string;
  argv: string[];
  printMode: boolean;
  debug: boolean;
  debugFilter?: string;
  debugFile?: string;
}
```

```ts
// src/io/logger.ts
export type LogLevel = "error" | "warn" | "info" | "debug";

export function createLogger(level: LogLevel) {
  return {
    error: (...args: unknown[]) => level !== "debug" && console.error(...args),
    warn: (...args: unknown[]) => (level === "info" || level === "debug") && console.warn(...args),
    info: (...args: unknown[]) => (level === "info" || level === "debug") && console.log(...args),
    debug: (...args: unknown[]) => level === "debug" && console.log(...args),
  };
}
```

```ts
// src/commands/doctor.ts
import type { CliContext } from "../core/context.js";

export async function doctorCommand(_ctx: CliContext) {
  return { ok: true };
}
```

```ts
// src/commands/install.ts
import type { CliContext } from "../core/context.js";

export async function installCommand(_ctx: CliContext, _target?: string) {
  return { ok: true };
}
```

```ts
// src/commands/mcp.ts
import type { CliContext } from "../core/context.js";

export async function mcpCommand(_ctx: CliContext) {
  return { ok: true };
}
```

```ts
// src/commands/plugin.ts
import type { CliContext } from "../core/context.js";

export async function pluginCommand(_ctx: CliContext) {
  return { ok: true };
}
```

```ts
// src/commands/setup-token.ts
import type { CliContext } from "../core/context.js";

export async function setupTokenCommand(_ctx: CliContext) {
  return { ok: true };
}
```

```ts
// src/commands/update.ts
import type { CliContext } from "../core/context.js";

export async function updateCommand(_ctx: CliContext) {
  return { ok: true };
}
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-context.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/context.ts src/io/logger.ts src/commands/*.ts tests/smoke/cli-context.test.mjs
git commit -m "feat: add cli context and command stubs"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 5: Wire Command Routing to the Stubs

**Files:**
- Modify: `src/cli/run.ts`
- Modify: `src/cli/definition.ts`
- Create: `src/cli/route.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-routing.test.mjs
import { readFileSync } from "node:fs";

const text = readFileSync("src/cli/route.ts", "utf8");
if (!text.includes("doctorCommand")) {
  throw new Error("route does not reference doctorCommand");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-routing.test.mjs`
Expected: FAIL because `src/cli/route.ts` does not exist yet.

**Step 3: Write minimal implementation**

```ts
// src/cli/route.ts
import type { CliContext } from "../core/context.js";
import { doctorCommand } from "../commands/doctor.js";
import { installCommand } from "../commands/install.js";
import { mcpCommand } from "../commands/mcp.js";
import { pluginCommand } from "../commands/plugin.js";
import { setupTokenCommand } from "../commands/setup-token.js";
import { updateCommand } from "../commands/update.js";

export async function routeCommand(ctx: CliContext, name?: string, arg?: string) {
  switch (name) {
    case "doctor":
      return doctorCommand(ctx);
    case "install":
      return installCommand(ctx, arg);
    case "mcp":
      return mcpCommand(ctx);
    case "plugin":
      return pluginCommand(ctx);
    case "setup-token":
      return setupTokenCommand(ctx);
    case "update":
      return updateCommand(ctx);
    default:
      return null;
  }
}
```

```ts
// src/cli/run.ts
import { createProgram } from "./definition.js";
import { routeCommand } from "./route.js";
import type { CliContext } from "../core/context.js";

export async function runCli(argv: string[]) {
  const program = createProgram();
  program.exitOverride();

  program.hook("preAction", async (cmd) => {
    const name = cmd.name();
    const arg = cmd.args?.[0];
    const ctx: CliContext = {
      cwd: process.cwd(),
      argv,
      printMode: Boolean(cmd.opts()?.print),
      debug: Boolean(cmd.opts()?.debug || cmd.opts()?.debugFile),
      debugFilter: cmd.opts()?.debug,
      debugFile: cmd.opts()?.debugFile,
    };
    await routeCommand(ctx, name === "claude" ? undefined : name, arg);
  });

  await program.parseAsync(argv, { from: "user" });
}
```

```ts
// src/cli/definition.ts (append after commands)
program.hook("preAction", () => undefined);
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-routing.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli/route.ts src/cli/run.ts src/cli/definition.ts tests/smoke/cli-routing.test.mjs
git commit -m "feat: wire cli routing to command stubs"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 6: Add Legacy Bridge for 1:1 Behavior

**Files:**
- Create: `src/legacy/bridge.ts`
- Modify: `bin/claude.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-legacy.test.mjs
import { readFileSync } from "node:fs";

const text = readFileSync("src/legacy/bridge.ts", "utf8");
if (!text.includes("runLegacy")) {
  throw new Error("legacy bridge missing runLegacy");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-legacy.test.mjs`
Expected: FAIL because `src/legacy/bridge.ts` does not exist yet.

**Step 3: Write minimal implementation**

```ts
// src/legacy/bridge.ts
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export function runLegacy(argv: string[]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const legacyBin = resolve(here, "..", "..", "cli.js");
  const result = spawnSync(process.execPath, [legacyBin, ...argv], { stdio: "inherit" });
  return result.status ?? 1;
}
```

```ts
// bin/claude.ts
#!/usr/bin/env node
import { runLegacy } from "../src/legacy/bridge.js";

const status = runLegacy(process.argv.slice(2));
process.exit(status);
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-legacy.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/legacy/bridge.ts bin/claude.ts tests/smoke/cli-legacy.test.mjs
git commit -m "feat: add legacy bridge for behavior parity"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 7: Replace Wrapper with Native TS Entry (Parity Check)

**Files:**
- Modify: `bin/claude.ts`
- Create: `src/cli/main.ts`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-native.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("bin/claude.ts");
const expected = readFileSync("tests/fixtures/help.txt", "utf8");
const actual = execFileSync("node", [bin, "--help"], { encoding: "utf8" });

if (actual.trim() !== expected.trim()) {
  throw new Error("native help output mismatch");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-native.test.mjs`
Expected: FAIL once you switch off the legacy bridge.

**Step 3: Write minimal implementation**

```ts
// src/cli/main.ts
import { runCli } from "./run.js";

export async function main() {
  await runCli(process.argv);
}
```

```ts
// bin/claude.ts
#!/usr/bin/env node
import { main } from "../src/cli/main.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-native.test.mjs`
Expected: PASS when the new CLI help output matches the fixture exactly.

**Step 5: Commit**

```bash
git add src/cli/main.ts bin/claude.ts tests/smoke/cli-native.test.mjs
git commit -m "feat: switch entrypoint to native ts cli"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

### Task 8: Document Next-Stage Porting Plan

**Files:**
- Create: `docs/porting/legacy-map.md`

**Step 1: Write the failing test**

```js
// tests/smoke/cli-porting-doc.test.mjs
import { readFileSync } from "node:fs";

const text = readFileSync("docs/porting/legacy-map.md", "utf8");
if (!text.includes("doctor")) {
  throw new Error("porting doc missing doctor entry");
}
```

**Step 2: Run test to verify it fails**

Run: `node tests/smoke/cli-porting-doc.test.mjs`
Expected: FAIL because `docs/porting/legacy-map.md` does not exist yet.

**Step 3: Write minimal implementation**

```md
# Legacy Porting Map

- doctor: locate handler in cli.js via "doctor" command string
- install: locate handler in cli.js via "install" command string
- mcp: locate handler in cli.js via "mcp" command string
- plugin: locate handler in cli.js via "plugin" command string
- setup-token: locate handler in cli.js via "setup-token" command string
- update: locate handler in cli.js via "update" command string
```

**Step 4: Run test to verify it passes**

Run: `node tests/smoke/cli-porting-doc.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/porting/legacy-map.md tests/smoke/cli-porting-doc.test.mjs
git commit -m "docs: add legacy porting map"
```
Expected: FAIL with "not a git repository" until git is initialized.

---

Plan complete and saved to `docs/plans/2026-02-03-claude-cli-restore.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?

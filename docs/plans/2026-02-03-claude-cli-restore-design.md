# Claude CLI Restore Design

**Goal:** Recreate a TypeScript codebase that mirrors the behavior of `cli.js` 1:1, with clear module boundaries, friendly names, and a standard CLI project structure.

## Architecture
- `bin/claude.ts` is the CLI entrypoint (`#!/usr/bin/env node`). It parses argv and delegates to `src/cli/run.ts`.
- `src/cli/` owns argument parsing and command routing. `parseArgs.ts` produces a typed structure consumed by `run.ts`.
- `src/commands/` contains per-command handlers (`doctor`, `install`, `mcp`, `plugin`, `setup-token`, `update`).
- `src/core/` contains session management, permissions/tooling, config loading, and shared runtime utilities.
- `src/io/` contains stdout/stderr/stream handling, debug logging, and print-mode formatting.
- `src/config/` merges settings from sources and handles schema validation.
- `src/legacy/` holds directly ported logic from the bundle when it is not practical to fully rewrite it immediately; stable, named wrapper functions expose it to the rest of the app.

## Restore Strategy
1. **Baseline output capture**: Save `cli.js --help` and `--version` outputs as fixtures to compare against restored output.
2. **Dependency discovery**: Extract external package names and Node built-ins from `cli.js` and place third-party dependencies into `package.json`.
3. **Moduleization**: Split the bundle into logical modules. For hard-to-separate portions, keep as `legacy` modules but expose friendly APIs.
4. **Command mapping**: Recreate the CLI surface (options and commands) to match the baseline output. Use custom help formatting if the standard CLI library diverges.
5. **Behavior parity**: Route execution through the same command names and parameters so the behavior stays consistent.

## Error Handling & Logging
- `--print` mode should favor deterministic output; interactive mode should be user-friendly.
- Handle `EPIPE` and stream errors gracefully to avoid noisy crashes.
- Centralize debug/verbose output in `src/io/logger.ts`.

## Testing
- Snapshot-style smoke tests for `--help` and `--version` output.
- Lightweight argument parsing tests to guard CLI surface parity.

## Notes
- External dependencies will be restored as package references instead of inlined bundle copies.
- The goal is correctness and fidelity; refactors can be staged after behavior parity is achieved.

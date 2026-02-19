import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { PluginCommand, PluginManifest, PluginTool, LoadedPlugin } from "./types.js";
import type { ToolDefinition } from "../tools/types.js";

export interface PluginExecutionContext {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
}

export interface PluginCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function resolvePluginEntry(baseDir: string, entry?: string) {
  if (!entry) return null;
  return resolve(baseDir, entry);
}

export function findPluginCommand(manifest: PluginManifest, name: string): PluginCommand | undefined {
  return manifest.commands?.find((command) => command.name === name);
}

export function findPluginTool(manifest: PluginManifest, name: string): PluginTool | undefined {
  return manifest.tools?.find((tool) => tool.name === name);
}

export async function runPluginCommand(
  plugin: LoadedPlugin,
  command: PluginCommand,
  args: string[] = [],
  context: PluginExecutionContext
): Promise<PluginCommandResult> {
  const entry = resolvePluginEntry(plugin.baseDir, command.entry);
  const executable = entry ?? command.name;
  const execArgs = [...(command.args ?? []), ...args];
  const env = { ...process.env, ...context.env };

  return await new Promise<PluginCommandResult>((resolveResult, reject) => {
    const child = spawn(executable, execArgs, { cwd: context.cwd, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => resolveResult({ stdout, stderr, exitCode: code }));
  });
}

export function createPluginToolDefinition(
  plugin: LoadedPlugin,
  tool: PluginTool,
  context: PluginExecutionContext
): ToolDefinition<Record<string, unknown>, unknown> {
  return {
    name: tool.name,
    description: tool.description ?? `Plugin tool ${tool.name}`,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "object", description: "Tool input payload" },
      },
      required: [],
    },
    async run(input) {
      const entry = resolvePluginEntry(plugin.baseDir, tool.entry);
      if (!entry) {
        return { error: `Plugin tool entry not defined for ${tool.name}` };
      }
      const env = { ...process.env, ...context.env };
      const payload = JSON.stringify(input ?? {});

      return await new Promise((resolveResult, reject) => {
        const child = spawn(process.execPath, [entry], { cwd: context.cwd, env, stdio: "pipe" });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
        child.on("error", (error) => reject(error));
        child.on("close", (code) => {
          const trimmed = stdout.trim();
          if (trimmed.length === 0) {
            resolveResult({ stdout, stderr, exitCode: code });
            return;
          }
          try {
            resolveResult(JSON.parse(trimmed));
          } catch {
            resolveResult({ stdout, stderr, exitCode: code });
          }
        });
        child.stdin.write(payload);
        child.stdin.end();
      });
    },
  };
}

export function buildPluginToolDefinitions(plugins: LoadedPlugin[], context: PluginExecutionContext) {
  const definitions: ToolDefinition[] = [];
  for (const plugin of plugins) {
    for (const tool of plugin.manifest.tools ?? []) {
      definitions.push(createPluginToolDefinition(plugin, tool, context));
    }
  }
  return definitions;
}

import { spawn } from "node:child_process";
import type { ToolContext, ToolDefinition } from "./types.js";

export interface BashInput {
  command: string;
  description?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  interrupted: boolean;
}

export function createBashTool(context: ToolContext): ToolDefinition<BashInput, BashResult> {
  return {
    name: "Bash",
    description: "Execute a shell command locally.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        description: { type: "string", description: "Optional description of the command" },
        cwd: { type: "string", description: "Working directory" },
        env: { type: "object", description: "Environment overrides" },
        timeout_ms: { type: "number", description: "Timeout in milliseconds" },
      },
      required: ["command"],
    },
    async run(input) {
      const command = input.command;
      const cwd = input.cwd ?? context.cwd;
      const env = { ...process.env, ...context.env, ...input.env };
      const timeoutMs = input.timeout_ms ?? 0;

      const isWin = process.platform === "win32";
      const shell = isWin ? process.env.COMSPEC || "cmd.exe" : "/bin/bash";
      const args = isWin ? ["/d", "/s", "/c", command] : ["-lc", command];

      return await new Promise<BashResult>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const child = spawn(shell, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const timeout =
          timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true;
                child.kill("SIGKILL");
              }, timeoutMs)
            : null;

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        child.on("error", (error) => {
          if (timeout) clearTimeout(timeout);
          reject(error);
        });

        child.on("close", (code) => {
          if (timeout) clearTimeout(timeout);
          resolve({
            stdout,
            stderr,
            exitCode: code,
            interrupted: timedOut,
          });
        });
      });
    },
  };
}

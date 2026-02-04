import type { CliContext } from "../core/context.js";
import { runLegacy } from "../legacy/bridge.js";

export async function doctorCommand(ctx: CliContext) {
  const exitCode = runLegacy(ctx.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
  return { exitCode };
}

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

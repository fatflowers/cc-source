import type { CliContext } from "../core/context.js";
import { doctorCommand } from "../commands/doctor.js";
import { installCommand } from "../commands/install.js";
import { mcpCommand } from "../commands/mcp.js";
import { pluginCommand } from "../commands/plugin.js";
import { setupTokenCommand } from "../commands/setup-token.js";
import { updateCommand } from "../commands/update.js";
import { runLegacy } from "../legacy/bridge.js";

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
      return runLegacy(ctx.argv.slice(2));
  }
}

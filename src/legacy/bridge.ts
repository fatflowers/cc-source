import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export function runLegacy(argv: string[]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const legacyBin = resolve(here, "..", "..", "cli.js");
  const result = spawnSync(process.execPath, [legacyBin, ...argv], { stdio: "inherit" });
  return result.status ?? 1;
}

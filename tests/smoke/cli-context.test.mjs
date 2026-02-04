import { readFileSync } from "node:fs";

const text = readFileSync("src/core/context.ts", "utf8");
if (!text.includes("export interface CliContext")) {
  throw new Error("CliContext interface missing");
}

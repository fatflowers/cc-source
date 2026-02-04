import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("bin/claude.ts");
const expected = readFileSync("tests/fixtures/version.txt", "utf8");
const actual = execFileSync("node", [bin, "--version"], { encoding: "utf8" });

if (actual.trim() !== expected.trim()) {
  throw new Error("version output mismatch");
}

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("bin/claude.ts");
const expected = readFileSync("tests/fixtures/help.txt", "utf8");
const actual = execFileSync("node", [bin, "--help"], { encoding: "utf8" });

if (actual.trim() !== expected.trim()) {
  throw new Error("help output mismatch");
}

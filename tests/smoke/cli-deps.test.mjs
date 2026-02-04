import { readFileSync } from "node:fs";

const third = readFileSync("docs/deps/third-party.txt", "utf8").trim();
if (!third.includes("ajv")) {
  throw new Error("expected ajv in third-party deps");
}

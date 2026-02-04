import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const text = readFileSync("cli.js", "utf8");
const requireRe = /require\(['"]([^'"]+)['"]\)/g;
const importRe = /import(?:[^'\"]+from\s*)?['\"]([^'\"]+)['\"]/g;

const deps = new Set();
const builtins = new Set();

for (const re of [requireRe, importRe]) {
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (spec.startsWith("node:")) builtins.add(spec);
    else if (!spec.startsWith(".")) {
      const parts = spec.split("/");
      const name = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      deps.add(name);
    }
  }
}

mkdirSync(resolve("docs", "deps"), { recursive: true });
writeFileSync(resolve("docs", "deps", "third-party.txt"), Array.from(deps).sort().join("\n") + "\n");
writeFileSync(resolve("docs", "deps", "node-builtins.txt"), Array.from(builtins).sort().join("\n") + "\n");

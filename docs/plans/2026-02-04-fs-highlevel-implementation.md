# Filesystem High-Level Ops Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add core filesystem high-level helpers and expose them as local tools (unrestricted) to match cli.js behavior.

**Architecture:** Implement reusable ops in `src/core/fs/ops.ts` (list/stat/tree/copy/move/remove/mkdir + metadata), then thin tool wrappers in `src/core/tools/` that parse inputs and return structured outputs. Register the new tools in `src/core/tools/index.ts`.

**Tech Stack:** TypeScript (ESM), Node `fs/promises` and `path`.

---

### Task 1: Core FS Types + List/Stat Helpers

**Files:**
- Create: `scripts/ts-loader.mjs`
- Create: `src/core/fs/ops.ts`
- Modify: `src/core/fs/index.ts`
- Test: `tests/core/fs/ops.list-stat.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/fs/ops.list-stat.test.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listDirectory, statPath } from "../../src/core/fs/ops.ts";

const tmpRoot = join(process.cwd(), ".tmp-fs-ops");
await mkdir(tmpRoot, { recursive: true });
await writeFile(join(tmpRoot, "file.txt"), "hello", "utf8");
await mkdir(join(tmpRoot, "dir"), { recursive: true });

const listing = await listDirectory(tmpRoot, { includeHidden: true, followSymlinks: false });
const names = listing.entries.map((e) => e.name).sort();
assert.deepEqual(names, ["dir", "file.txt"]);

const fileInfo = await statPath(join(tmpRoot, "file.txt"));
assert.equal(fileInfo.type, "file");
assert.equal(typeof fileInfo.size, "number");
assert.equal(fileInfo.size > 0, true);

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/fs/ops.list-stat.test.mjs`
Expected: FAIL with “Cannot find module …/ops.ts” or “listDirectory is not a function”.

**Step 3: Write minimal implementation**

```js
// scripts/ts-loader.mjs
import ts from "typescript";
import { readFile } from "node:fs/promises";

export async function load(url, context, defaultLoad) {
  if (!url.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }
  const source = await readFile(new URL(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  return { format: "module", source: outputText };
}
```

```ts
// src/core/fs/ops.ts
import { readdir, stat, lstat } from "node:fs/promises";
import { basename, resolve } from "node:path";

export type FsEntryType = "file" | "directory" | "symlink" | "other";

export interface FsEntryInfo {
  path: string;
  name: string;
  type: FsEntryType;
  size: number;
  mtimeMs: number;
  mode: number;
  isSymlink: boolean;
}

export interface ListDirectoryOptions {
  includeHidden?: boolean;
  followSymlinks?: boolean;
}

export interface ListDirectoryResult {
  path: string;
  entries: FsEntryInfo[];
}

function mapStatToType(st: Awaited<ReturnType<typeof stat>>): FsEntryType {
  if (st.isFile()) return "file";
  if (st.isDirectory()) return "directory";
  if (st.isSymbolicLink()) return "symlink";
  return "other";
}

export async function statPath(path: string): Promise<FsEntryInfo> {
  const st = await lstat(path);
  return {
    path,
    name: basename(path),
    type: mapStatToType(st),
    size: st.size,
    mtimeMs: st.mtimeMs,
    mode: st.mode,
    isSymlink: st.isSymbolicLink(),
  };
}

export async function listDirectory(
  dirPath: string,
  options: ListDirectoryOptions = {}
): Promise<ListDirectoryResult> {
  const abs = resolve(dirPath);
  const entries = await readdir(abs, { withFileTypes: true });
  const out: FsEntryInfo[] = [];
  for (const entry of entries) {
    if (!options.includeHidden && entry.name.startsWith(".")) continue;
    const fullPath = resolve(abs, entry.name);
    const st = options.followSymlinks ? await stat(fullPath) : await lstat(fullPath);
    out.push({
      path: fullPath,
      name: entry.name,
      type: mapStatToType(st),
      size: st.size,
      mtimeMs: st.mtimeMs,
      mode: st.mode,
      isSymlink: entry.isSymbolicLink(),
    });
  }
  return { path: abs, entries: out };
}
```

```ts
// src/core/fs/index.ts
export * from "./limits.js";
export * from "./types.js";
export * from "./readers.js";
export * from "./ops.js";
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/fs/ops.list-stat.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add scripts/ts-loader.mjs src/core/fs/ops.ts src/core/fs/index.ts tests/core/fs/ops.list-stat.test.mjs
git commit -m "feat: add fs list/stat helpers"
```

---

### Task 2: Tree Walk + Copy/Move/Remove/Mkdir Helpers

**Files:**
- Modify: `src/core/fs/ops.ts`
- Test: `tests/core/fs/ops.tree-copy-move.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/fs/ops.tree-copy-move.test.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { walkTree, copyPath, movePath, removePath, ensureDir } from "../../src/core/fs/ops.ts";

const root = join(process.cwd(), ".tmp-fs-ops-tree");
await ensureDir(root);
await writeFile(join(root, "a.txt"), "a", "utf8");
await ensureDir(join(root, "sub"));
await writeFile(join(root, "sub", "b.txt"), "b", "utf8");

const tree = await walkTree(root, { maxDepth: 2 });
assert.equal(tree.entries.length >= 2, true);

const dest = join(process.cwd(), ".tmp-fs-ops-tree-copy");
await copyPath(root, dest, { overwrite: true });
const copied = await walkTree(dest, { maxDepth: 2 });
assert.equal(copied.entries.length, tree.entries.length);

const moved = join(process.cwd(), ".tmp-fs-ops-tree-moved");
await movePath(dest, moved, { overwrite: true });
const movedTree = await walkTree(moved, { maxDepth: 2 });
assert.equal(movedTree.entries.length, tree.entries.length);

await removePath(moved, { recursive: true });

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/fs/ops.tree-copy-move.test.mjs`
Expected: FAIL with “walkTree is not a function”.

**Step 3: Write minimal implementation**

```ts
// Append to src/core/fs/ops.ts
import { copyFile, mkdir, rm, rename } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";

export interface WalkTreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  followSymlinks?: boolean;
}

export interface WalkTreeResult {
  path: string;
  entries: FsEntryInfo[];
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function walkTree(
  rootPath: string,
  options: WalkTreeOptions = {}
): Promise<WalkTreeResult> {
  const abs = resolve(rootPath);
  const out: FsEntryInfo[] = [];
  const maxDepth = options.maxDepth ?? Infinity;

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const listing = await listDirectory(dir, options);
    for (const entry of listing.entries) {
      out.push(entry);
      if (entry.type === "directory") {
        await walk(entry.path, depth + 1);
      }
    }
  }

  await walk(abs, 1);
  return { path: abs, entries: out };
}

export interface CopyMoveOptions {
  overwrite?: boolean;
}

export async function copyPath(src: string, dest: string, options: CopyMoveOptions = {}) {
  const srcInfo = await statPath(src);
  if (srcInfo.type === "directory") {
    await ensureDir(dest);
    const listing = await listDirectory(src, { includeHidden: true });
    for (const entry of listing.entries) {
      const childDest = resolve(dest, entry.name);
      await copyPath(entry.path, childDest, options);
    }
    return;
  }

  await ensureDir(dirname(dest));
  if (!options.overwrite) {
    try {
      await stat(dest);
      throw new Error(`Destination exists: ${dest}`);
    } catch {}
  }
  await copyFile(src, dest);
}

export async function movePath(src: string, dest: string, options: CopyMoveOptions = {}) {
  if (!options.overwrite) {
    try {
      await stat(dest);
      throw new Error(`Destination exists: ${dest}`);
    } catch {}
  }
  await ensureDir(dirname(dest));
  await rename(src, dest);
}

export async function removePath(
  target: string,
  options: { recursive?: boolean } = {}
) {
  await rm(target, { force: true, recursive: options.recursive ?? false });
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/fs/ops.tree-copy-move.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add src/core/fs/ops.ts tests/core/fs/ops.tree-copy-move.test.mjs
git commit -m "feat: add fs tree/copy/move/remove helpers"
```

---

### Task 3: Tool Wrappers + Registration

**Files:**
- Create: `src/core/tools/ls.ts`
- Create: `src/core/tools/stat.ts`
- Create: `src/core/tools/tree.ts`
- Create: `src/core/tools/copy.ts`
- Create: `src/core/tools/move.ts`
- Create: `src/core/tools/rm.ts`
- Create: `src/core/tools/mkdir.ts`
- Modify: `src/core/tools/index.ts`
- Test: `tests/core/tools/fs-tools.test.mjs`

**Step 1: Write the failing test**

```js
// tests/core/tools/fs-tools.test.mjs
import assert from "node:assert/strict";
import { createLsTool } from "../../src/core/tools/ls.ts";
import { createStatTool } from "../../src/core/tools/stat.ts";

const ls = createLsTool({ cwd: process.cwd() });
assert.equal(ls.name, "Ls");

const st = createStatTool({ cwd: process.cwd() });
assert.equal(st.name, "Stat");

console.log("ok");
```

**Step 2: Run test to verify it fails**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/tools/fs-tools.test.mjs`
Expected: FAIL with “Cannot find module …/ls.ts”.

**Step 3: Write minimal implementation**

```ts
// src/core/tools/ls.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { listDirectory } from "../fs/ops.js";

export interface LsInput {
  path: string;
  include_hidden?: boolean;
  follow_symlinks?: boolean;
}

export function createLsTool(_context: ToolContext): ToolDefinition<LsInput, unknown> {
  return {
    name: "Ls",
    description: "List directory entries.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        include_hidden: { type: "boolean", description: "Include dotfiles" },
        follow_symlinks: { type: "boolean", description: "Follow symlinks when statting entries" },
      },
      required: ["path"],
    },
    async run(input) {
      return listDirectory(input.path, {
        includeHidden: input.include_hidden,
        followSymlinks: input.follow_symlinks,
      });
    },
  };
}
```

```ts
// src/core/tools/stat.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { statPath } from "../fs/ops.js";

export interface StatInput {
  path: string;
}

export function createStatTool(_context: ToolContext): ToolDefinition<StatInput, unknown> {
  return {
    name: "Stat",
    description: "Return file or directory metadata.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to stat" },
      },
      required: ["path"],
    },
    async run(input) {
      return statPath(input.path);
    },
  };
}
```

```ts
// src/core/tools/tree.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { walkTree } from "../fs/ops.js";

export interface TreeInput {
  path: string;
  max_depth?: number;
  include_hidden?: boolean;
  follow_symlinks?: boolean;
}

export function createTreeTool(_context: ToolContext): ToolDefinition<TreeInput, unknown> {
  return {
    name: "Tree",
    description: "Recursively list files under a path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Root path" },
        max_depth: { type: "number", description: "Maximum recursion depth" },
        include_hidden: { type: "boolean", description: "Include dotfiles" },
        follow_symlinks: { type: "boolean", description: "Follow symlinks" },
      },
      required: ["path"],
    },
    async run(input) {
      return walkTree(input.path, {
        maxDepth: input.max_depth,
        includeHidden: input.include_hidden,
        followSymlinks: input.follow_symlinks,
      });
    },
  };
}
```

```ts
// src/core/tools/copy.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { copyPath } from "../fs/ops.js";

export interface CopyInput {
  from: string;
  to: string;
  overwrite?: boolean;
}

export function createCopyTool(_context: ToolContext): ToolDefinition<CopyInput, { success: true }> {
  return {
    name: "Copy",
    description: "Copy a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path" },
        to: { type: "string", description: "Destination path" },
        overwrite: { type: "boolean", description: "Overwrite destination" },
      },
      required: ["from", "to"],
    },
    async run(input) {
      await copyPath(input.from, input.to, { overwrite: input.overwrite });
      return { success: true };
    },
  };
}
```

```ts
// src/core/tools/move.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { movePath } from "../fs/ops.js";

export interface MoveInput {
  from: string;
  to: string;
  overwrite?: boolean;
}

export function createMoveTool(_context: ToolContext): ToolDefinition<MoveInput, { success: true }> {
  return {
    name: "Move",
    description: "Move or rename a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source path" },
        to: { type: "string", description: "Destination path" },
        overwrite: { type: "boolean", description: "Overwrite destination" },
      },
      required: ["from", "to"],
    },
    async run(input) {
      await movePath(input.from, input.to, { overwrite: input.overwrite });
      return { success: true };
    },
  };
}
```

```ts
// src/core/tools/rm.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { removePath } from "../fs/ops.js";

export interface RmInput {
  path: string;
  recursive?: boolean;
}

export function createRmTool(_context: ToolContext): ToolDefinition<RmInput, { success: true }> {
  return {
    name: "Rm",
    description: "Remove a file or directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to remove" },
        recursive: { type: "boolean", description: "Remove recursively" },
      },
      required: ["path"],
    },
    async run(input) {
      await removePath(input.path, { recursive: input.recursive });
      return { success: true };
    },
  };
}
```

```ts
// src/core/tools/mkdir.ts
import type { ToolContext, ToolDefinition } from "./types.js";
import { ensureDir } from "../fs/ops.js";

export interface MkdirInput {
  path: string;
}

export function createMkdirTool(_context: ToolContext): ToolDefinition<MkdirInput, { success: true }> {
  return {
    name: "Mkdir",
    description: "Create a directory (recursive).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
    async run(input) {
      await ensureDir(input.path);
      return { success: true };
    },
  };
}
```

```ts
// src/core/tools/index.ts
import { createLsTool } from "./ls.js";
import { createStatTool } from "./stat.js";
import { createTreeTool } from "./tree.js";
import { createCopyTool } from "./copy.js";
import { createMoveTool } from "./move.js";
import { createRmTool } from "./rm.js";
import { createMkdirTool } from "./mkdir.js";

export const BUILTIN_TOOL_NAMES = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "NotebookEdit",
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  "Ls",
  "Stat",
  "Tree",
  "Copy",
  "Move",
  "Rm",
  "Mkdir",
]);

export function createLocalTools(context: ToolContext): ToolDefinition[] {
  return [
    createReadTool(context),
    createWriteTool(context),
    createEditTool(context),
    createGlobTool(context),
    createGrepTool(context),
    createBashTool(context),
    createNotebookEditTool(context),
    createLsTool(context),
    createStatTool(context),
    createTreeTool(context),
    createCopyTool(context),
    createMoveTool(context),
    createRmTool(context),
    createMkdirTool(context),
  ];
}
```

**Step 4: Run test to verify it passes**

Run: `node --loader ./scripts/ts-loader.mjs tests/core/tools/fs-tools.test.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add src/core/tools/ls.ts src/core/tools/stat.ts src/core/tools/tree.ts src/core/tools/copy.ts src/core/tools/move.ts src/core/tools/rm.ts src/core/tools/mkdir.ts src/core/tools/index.ts tests/core/tools/fs-tools.test.mjs
git commit -m "feat: add fs high-level tools"
```

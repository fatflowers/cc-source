import { copyFile, mkdir, readdir, readlink, rename, rm, stat, lstat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export type FsEntryType = "file" | "directory" | "symlink" | "other";

export interface FsEntryInfo {
  path: string;
  name: string;
  type: FsEntryType;
  size: number;
  mtimeMs: number;
  mode: number;
  isSymlink: boolean;
  symlinkTarget?: string | null;
}

export interface ListDirectoryOptions {
  includeHidden?: boolean;
  followSymlinks?: boolean;
}

export interface ListDirectoryResult {
  path: string;
  entries: FsEntryInfo[];
}

export interface WalkTreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  followSymlinks?: boolean;
}

export interface WalkTreeResult {
  path: string;
  entries: FsEntryInfo[];
}

export interface CopyMoveOptions {
  overwrite?: boolean;
}

export function mapStatToType(stats: Awaited<ReturnType<typeof stat>>): FsEntryType {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

export async function statPath(path: string): Promise<FsEntryInfo> {
  const st = await lstat(path);
  const isSymlink = st.isSymbolicLink();
  let target: string | null = null;
  if (isSymlink) {
    try {
      target = await readlink(path);
    } catch {
      target = null;
    }
  }
  return {
    path,
    name: basename(path),
    type: mapStatToType(st),
    size: st.size,
    mtimeMs: st.mtimeMs,
    mode: st.mode,
    isSymlink,
    symlinkTarget: target,
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
    const lst = await lstat(fullPath);
    const isSymlink = lst.isSymbolicLink();
    const st = options.followSymlinks && isSymlink ? await stat(fullPath) : lst;
    let target: string | null = null;
    if (isSymlink) {
      try {
        target = await readlink(fullPath);
      } catch {
        target = null;
      }
    }
    out.push({
      path: fullPath,
      name: entry.name,
      type: mapStatToType(st),
      size: st.size,
      mtimeMs: st.mtimeMs,
      mode: st.mode,
      isSymlink,
      symlinkTarget: target,
    });
  }
  return { path: abs, entries: out };
}

export async function walkTree(
  rootPath: string,
  options: WalkTreeOptions = {}
): Promise<WalkTreeResult> {
  const abs = resolve(rootPath);
  const out: FsEntryInfo[] = [];
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;

  const walk = async (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    const listing = await listDirectory(dir, options);
    for (const entry of listing.entries) {
      out.push(entry);
      if (entry.type === "directory") {
        await walk(entry.path, depth + 1);
      }
    }
  };

  await walk(abs, 1);
  return { path: abs, entries: out };
}

export async function ensureDir(path: string, mode?: number): Promise<void> {
  await mkdir(path, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
}

export async function copyPath(src: string, dest: string, options: CopyMoveOptions = {}) {
  const srcInfo = await statPath(src);
  if (srcInfo.type === "directory") {
    await ensureDir(dest);
    const listing = await listDirectory(src, { includeHidden: true });
    for (const entry of listing.entries) {
      await copyPath(entry.path, resolve(dest, entry.name), options);
    }
    return;
  }

  await ensureDir(dirname(dest));
  if (!options.overwrite) {
    try {
      await stat(dest);
      throw new Error(`Destination exists: ${dest}`);
    } catch {
      // ignore missing
    }
  }
  await copyFile(src, dest);
}

export async function movePath(src: string, dest: string, options: CopyMoveOptions = {}) {
  if (!options.overwrite) {
    try {
      await stat(dest);
      throw new Error(`Destination exists: ${dest}`);
    } catch {
      // ignore missing
    }
  }
  await ensureDir(dirname(dest));
  try {
    await rename(src, dest);
  } catch (error: any) {
    if (error?.code === "EXDEV") {
      await copyPath(src, dest, { overwrite: options.overwrite });
      await removePath(src, { recursive: true });
      return;
    }
    throw error;
  }
}

export async function removePath(target: string, options: { recursive?: boolean } = {}) {
  await rm(target, { force: true, recursive: options.recursive ?? false });
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedPlugin, PluginManifest } from "./types.js";

const MANIFEST_FILES = ["plugin.json", "claude.plugin.json"];

async function loadManifest(path: string): Promise<PluginManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as PluginManifest;
  } catch {
    return null;
  }
}

export async function loadPluginsFromDir(dir: string): Promise<LoadedPlugin[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const plugins: LoadedPlugin[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const baseDir = join(dir, entry.name);
    let manifest: PluginManifest | null = null;
    for (const manifestName of MANIFEST_FILES) {
      manifest = await loadManifest(join(baseDir, manifestName));
      if (manifest) break;
    }
    if (manifest) {
      plugins.push({ manifest, baseDir });
    }
  }
  return plugins;
}

export async function loadPluginsFromDirs(dirs: string[]) {
  const all: LoadedPlugin[] = [];
  for (const dir of dirs) {
    all.push(...(await loadPluginsFromDir(dir)));
  }
  return all;
}

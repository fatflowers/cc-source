import { readFile } from "node:fs/promises";
import type { McpServerConfig } from "./types.js";

export async function loadMcpConfigFromString(config: string): Promise<McpServerConfig[]> {
  const parsed = JSON.parse(config) as McpServerConfig[] | { servers?: McpServerConfig[] };
  if (Array.isArray(parsed)) return parsed;
  return parsed.servers ?? [];
}

export async function loadMcpConfigFromFile(path: string): Promise<McpServerConfig[]> {
  const content = await readFile(path, "utf8");
  return loadMcpConfigFromString(content);
}

export async function loadMcpConfigs(inputs: string[]): Promise<McpServerConfig[]> {
  const configs: McpServerConfig[] = [];
  for (const input of inputs) {
    if (input.trim().startsWith("{") || input.trim().startsWith("[")) {
      configs.push(...(await loadMcpConfigFromString(input)));
    } else {
      configs.push(...(await loadMcpConfigFromFile(input)));
    }
  }
  return configs;
}

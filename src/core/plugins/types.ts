export interface PluginCommand {
  name: string;
  description?: string;
  entry?: string;
  args?: string[];
}

export interface PluginTool {
  name: string;
  description?: string;
  entry?: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  commands?: PluginCommand[];
  tools?: PluginTool[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  baseDir: string;
}

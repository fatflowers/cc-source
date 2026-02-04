export interface ToolContext {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Input) => Promise<Output> | Output;
  parse?: (input: unknown) => Input;
}

export type ToolMap = Record<string, ToolDefinition>;

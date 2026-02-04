export interface CliContext {
  cwd: string;
  argv: string[];
  printMode: boolean;
  debug: boolean;
  debugFilter?: string;
  debugFile?: string;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export function createLogger(level: LogLevel) {
  return {
    error: (...args: unknown[]) => level !== "debug" && console.error(...args),
    warn: (...args: unknown[]) => (level === "info" || level === "debug") && console.warn(...args),
    info: (...args: unknown[]) => (level === "info" || level === "debug") && console.log(...args),
    debug: (...args: unknown[]) => level === "debug" && console.log(...args),
  };
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.log(message, meta);
  } else {
    console.log(message);
  }
}

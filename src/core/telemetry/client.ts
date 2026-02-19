export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export interface TelemetryContext {
  sessionId?: string;
  userId?: string;
  appVersion?: string;
  environment?: string;
}

export class TelemetrySafeError extends Error {
  telemetryMessage: string;

  constructor(message: string, telemetryMessage?: string) {
    super(message);
    this.name = "TelemetrySafeError";
    this.telemetryMessage = telemetryMessage ?? message;
  }
}

export class TelemetryClient {
  private enabled: boolean;
  private buffer: TelemetryEvent[] = [];
  private context: TelemetryContext = {};
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    enabled: boolean,
    private readonly options: {
      endpoint?: string;
      headers?: Record<string, string>;
      flushIntervalMs?: number;
      maxBuffer?: number;
      logger?: { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
    } = {}
  ) {
    this.enabled = enabled;
    if (this.enabled && this.options.flushIntervalMs) {
      this.start();
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setContext(context: TelemetryContext) {
    this.context = { ...this.context, ...context };
  }

  track(event: TelemetryEvent) {
    if (!this.enabled) return;
    const payload = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
      properties: { ...this.context, ...event.properties },
    };
    this.buffer.push(payload);
    if (this.options.maxBuffer && this.buffer.length >= this.options.maxBuffer) {
      void this.flush();
    }
  }

  trackError(error: unknown, name = "error", properties?: Record<string, unknown>) {
    const message =
      error instanceof TelemetrySafeError
        ? error.telemetryMessage
        : error instanceof Error
        ? error.message
        : String(error);
    this.track({ name, properties: { ...properties, message } });
  }

  async flush() {
    if (!this.enabled) return [] as TelemetryEvent[];
    if (this.buffer.length === 0) return [] as TelemetryEvent[];

    const events = [...this.buffer];
    this.buffer = [];

    if (this.options.endpoint) {
      await this.send(events).catch((error) => {
        this.options.logger?.warn?.("Telemetry flush failed", error);
      });
    }

    return events;
  }

  start() {
    if (this.flushTimer || !this.options.flushIntervalMs) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);
  }

  stop() {
    if (!this.flushTimer) return;
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  private async send(events: TelemetryEvent[]) {
    if (!this.options.endpoint) return;
    const body = JSON.stringify({ events });
    const headers = {
      "Content-Type": "application/json",
      ...this.options.headers,
    };
    if (typeof fetch === "function") {
      await fetch(this.options.endpoint, { method: "POST", headers, body });
      return;
    }
  }
}

export function createTelemetryClient() {
  const enabled =
    process.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" ||
    process.env.CLAUDE_CODE_ENABLE_TELEMETRY === "true";
  const endpoint = process.env.CLAUDE_CODE_TELEMETRY_ENDPOINT;
  const flushIntervalMs = process.env.CLAUDE_CODE_TELEMETRY_FLUSH_MS
    ? Number(process.env.CLAUDE_CODE_TELEMETRY_FLUSH_MS)
    : undefined;
  const maxBuffer = process.env.CLAUDE_CODE_TELEMETRY_MAX_BUFFER
    ? Number(process.env.CLAUDE_CODE_TELEMETRY_MAX_BUFFER)
    : undefined;

  return new TelemetryClient(enabled, {
    endpoint,
    flushIntervalMs,
    maxBuffer,
  });
}

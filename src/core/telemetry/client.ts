export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export class TelemetryClient {
  private enabled: boolean;
  private buffer: TelemetryEvent[] = [];

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  track(event: TelemetryEvent) {
    if (!this.enabled) return;
    this.buffer.push({ ...event, timestamp: event.timestamp ?? Date.now() });
  }

  flush() {
    if (!this.enabled) return [];
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }
}

export function createTelemetryClient() {
  const enabled =
    process.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" ||
    process.env.CLAUDE_CODE_ENABLE_TELEMETRY === "true";
  return new TelemetryClient(enabled);
}

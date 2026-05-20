import { EventEmitter } from "node:events";

export interface AgentTransportEvents {
  data: (chunk: string) => void;
  exit: (code: number) => void;
  error: (err: Error) => void;
}

/**
 * Abstract transport that normalizes PTY processes, HTTP streams, and mocks
 * behind a single interface. Consumers don't care whether bytes come from a
 * subprocess or an SSE channel — they get `data` chunks and a final `exit`.
 */
export abstract class AgentTransport extends EventEmitter {
  abstract write(input: string): void;
  abstract kill(signal?: NodeJS.Signals): void;
  abstract get pid(): number | undefined;

  override on<K extends keyof AgentTransportEvents>(
    event: K,
    listener: AgentTransportEvents[K],
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof AgentTransportEvents>(
    event: K,
    ...args: Parameters<AgentTransportEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

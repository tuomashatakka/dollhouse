import { fetch } from "undici";
import { AgentTransport } from "./AgentTransport.js";

export type ChunkExtractor = (rawLine: string) => string | null;

export interface HttpStreamOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /**
   * How to extract a printable text fragment from each raw line of the
   * response stream. Return null to skip the line (keepalives, sentinels).
   */
  extract: ChunkExtractor;
  /** Optional preamble emitted before the first chunk. */
  preamble?: string;
}

/**
 * Streams a chunked HTTP response (NDJSON or SSE) and emits each parsed text
 * fragment as a `data` event. Used by Ollama (NDJSON via /api/generate) and
 * apfel (SSE or NDJSON depending on endpoint).
 */
export class HttpStreamTransport extends AgentTransport {
  private controller = new AbortController();
  private exited = false;

  constructor(opts: HttpStreamOptions) {
    super();
    if (opts.preamble) {
      queueMicrotask(() => this.emit("data", opts.preamble!));
    }
    void this.run(opts);
  }

  override get pid(): number | undefined {
    return undefined;
  }

  override write(_input: string): void {
    // HTTP requests aren't bidirectional in this transport.
    this.emit(
      "data",
      "\r\n\x1b[33m[http transport is one-shot; input ignored]\x1b[0m\r\n",
    );
  }

  override kill(): void {
    if (this.exited) return;
    this.exited = true;
    this.controller.abort();
    this.emit("data", "\r\n\x1b[33m[http stream aborted]\x1b[0m\r\n");
    this.emit("exit", 137);
  }

  private async run(opts: HttpStreamOptions): Promise<void> {
    try {
      const res = await fetch(opts.url, {
        method: opts.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/x-ndjson, application/json",
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: this.controller.signal,
      });

      if (!res.ok || !res.body) {
        this.emit(
          "data",
          `\r\n\x1b[31mHTTP ${res.status} ${res.statusText}\x1b[0m\r\n`,
        );
        this.emit("exit", 1);
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        if (this.exited) return;
        buf += decoder.decode(chunk, { stream: true });
        // Split on newlines (works for both NDJSON and SSE — for SSE the
        // extractor strips the "data: " prefix).
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const piece = opts.extract(raw);
          if (piece != null) this.emit("data", piece);
        }
      }
      if (buf.length > 0) {
        const piece = opts.extract(buf);
        if (piece != null) this.emit("data", piece);
      }

      if (!this.exited) {
        this.exited = true;
        this.emit("data", "\r\n\x1b[32m✓ stream complete\x1b[0m\r\n");
        this.emit("exit", 0);
      }
    } catch (err) {
      if (this.exited) return;
      this.exited = true;
      this.emit("error", err as Error);
      this.emit("data", `\r\n\x1b[31m${(err as Error).message}\x1b[0m\r\n`);
      this.emit("exit", 1);
    }
  }
}

/* ──────────────── extractors for the providers we support ──────────────── */

export const ollamaExtractor: ChunkExtractor = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as { response?: string; done?: boolean };
    return obj.response ?? null;
  } catch {
    return null;
  }
};

export const sseExtractor: ChunkExtractor = (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return null;
  try {
    const obj = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
      response?: string;
      text?: string;
    };
    return (
      obj.choices?.[0]?.delta?.content ??
      obj.response ??
      obj.text ??
      null
    );
  } catch {
    return payload;
  }
};

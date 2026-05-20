import { AgentTransport } from "./AgentTransport.js";

export interface EchoOptions {
  subtask: string;
  cwd: string;
  /** Tick interval between synthetic output chunks (ms). */
  tickMs?: number;
  /** Number of chunks to emit before exit. */
  ticks?: number;
}

/**
 * Mock transport that emits synthetic, ANSI-colored output on a timer.
 * Lets us exercise the full dollhouse animation pipeline without spending
 * tokens on real CLIs.
 */
export class EchoTransport extends AgentTransport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private remaining: number;
  private killed = false;
  readonly subtask: string;
  private readonly cwd: string;
  private readonly tickMs: number;

  constructor(opts: EchoOptions) {
    super();
    this.subtask = opts.subtask;
    this.cwd = opts.cwd;
    this.tickMs = opts.tickMs ?? 850;
    this.remaining = opts.ticks ?? 60;

    queueMicrotask(() => this.start());
  }

  override get pid(): number | undefined {
    return undefined; // no real OS process
  }

  override write(input: string): void {
    // Echo user input back as if it were stdout.
    this.emit("data", `\x1b[36m>\x1b[0m ${input}`);
  }

  override kill(): void {
    if (this.killed) return;
    this.killed = true;
    if (this.timer) clearInterval(this.timer);
    this.emit("data", "\r\n\x1b[33m[echo agent terminated]\x1b[0m\r\n");
    this.emit("exit", 143);
  }

  private start(): void {
    this.emit(
      "data",
      `\x1b[35m🪞 echo agent\x1b[0m  cwd=\x1b[2m${this.cwd}\x1b[0m\r\n` +
        `\x1b[35m🪞 subtask:\x1b[0m ${this.subtask}\r\n\r\n`,
    );

    this.timer = setInterval(() => {
      if (this.killed) return;
      if (this.remaining-- <= 0) {
        if (this.timer) clearInterval(this.timer);
        this.emit("data", "\r\n\x1b[32m✓ echo task complete\x1b[0m\r\n");
        this.emit("exit", 0);
        return;
      }
      const verbs = ["thinking", "reading", "writing", "polishing", "tinkering"];
      const v = verbs[Math.floor(Math.random() * verbs.length)] ?? "working";
      this.emit("data", `  \x1b[2m·\x1b[0m ${v}…\r\n`);
    }, this.tickMs);
  }
}

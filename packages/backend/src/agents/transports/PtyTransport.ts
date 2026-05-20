import { spawn, type IPty } from "node-pty";
import { AgentTransport } from "./AgentTransport.js";

export interface PtyOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * Wraps node-pty for AI CLIs that expect a TTY (claude-code, gemini-cli,
 * opencode). Forwards data + exit events, lets the consumer write to stdin.
 */
export class PtyTransport extends AgentTransport {
  private pty: IPty;
  private exited = false;

  constructor(opts: PtyOptions) {
    super();
    const env = {
      ...process.env,
      ...opts.env,
      TERM: opts.env?.TERM ?? "xterm-256color",
      FORCE_COLOR: "1",
    } as Record<string, string>;

    this.pty = spawn(opts.command, opts.args, {
      name: "xterm-256color",
      cols: opts.cols ?? 100,
      rows: opts.rows ?? 30,
      cwd: opts.cwd,
      env,
    });

    this.pty.onData((data) => {
      if (!this.exited) this.emit("data", data);
    });
    this.pty.onExit(({ exitCode }) => {
      if (this.exited) return;
      this.exited = true;
      this.emit("exit", exitCode);
    });
  }

  override get pid(): number | undefined {
    return this.pty.pid;
  }

  override write(input: string): void {
    if (this.exited) return;
    this.pty.write(input);
  }

  override kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.exited) return;
    try {
      this.pty.kill(signal);
    } catch {
      // ignore — process already dead
    }
  }
}

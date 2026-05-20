import { execSync } from "node:child_process";
import { PtyTransport } from "../transports/PtyTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

function findBinary(): string | null {
  try {
    return execSync("which claude", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const bin = findBinary();

export const claudeCodeSpec: AgentSpec | null = bin
  ? {
      type: "claude-code",
      label: "Claude Code",
      build: ({ subtask, cwd }) =>
        new PtyTransport({
          command: bin,
          // -p / --print sends a one-shot prompt and writes the response
          // to stdout, then exits. For interactive use the user could swap to
          // `claude` with no args.
          args: ["-p", subtask],
          cwd,
        }),
    }
  : null;

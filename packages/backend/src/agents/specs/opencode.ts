import { execSync } from "node:child_process";
import { PtyTransport } from "../transports/PtyTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

function findBinary(): string | null {
  try {
    return execSync("which opencode", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const bin = findBinary();

export const opencodeSpec: AgentSpec | null = bin
  ? {
      type: "opencode",
      label: "OpenCode",
      build: ({ subtask, cwd }) =>
        new PtyTransport({
          command: bin,
          args: ["run", subtask],
          cwd,
        }),
    }
  : null;

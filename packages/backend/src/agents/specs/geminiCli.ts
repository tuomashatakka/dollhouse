import { execSync } from "node:child_process";
import { PtyTransport } from "../transports/PtyTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

function findBinary(): string | null {
  try {
    return execSync("which gemini", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const bin = findBinary();

export const geminiCliSpec: AgentSpec | null = bin
  ? {
      type: "gemini-cli",
      label: "Gemini CLI",
      build: ({ subtask, cwd }) =>
        new PtyTransport({
          command: bin,
          args: ["-p", subtask],
          cwd,
        }),
    }
  : null;

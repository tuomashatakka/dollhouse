import type { AgentType } from "@dollhouse/shared";
import type { AgentTransport } from "./transports/AgentTransport.js";
import { apfelSpec } from "./specs/apfel.js";
import { claudeCodeSpec } from "./specs/claudeCode.js";
import { echoSpec } from "./specs/echo.js";
import { geminiCliSpec } from "./specs/geminiCli.js";
import { ollamaSpec } from "./specs/ollama.js";
import { opencodeSpec } from "./specs/opencode.js";

export interface AgentSpec {
  type: AgentType;
  label: string;
  build: (opts: { subtask: string; cwd: string }) => AgentTransport;
}

export const AGENT_REGISTRY: Partial<Record<AgentType, AgentSpec>> = {
  echo: echoSpec,
  ollama: ollamaSpec,
  apfel: apfelSpec,
  ...(claudeCodeSpec ? { "claude-code": claudeCodeSpec } : {}),
  ...(geminiCliSpec ? { "gemini-cli": geminiCliSpec } : {}),
  ...(opencodeSpec ? { opencode: opencodeSpec } : {}),
};

export function resolveSpec(type: AgentType): {
  spec: AgentSpec;
  fellBack: boolean;
} {
  const spec = AGENT_REGISTRY[type];
  if (spec) return { spec, fellBack: false };
  return { spec: echoSpec, fellBack: true };
}

export function availableAgentTypes(): AgentType[] {
  return Object.keys(AGENT_REGISTRY) as AgentType[];
}

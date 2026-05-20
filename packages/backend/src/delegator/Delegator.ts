import type { AgentType, DelegatorPlan, Task } from "@dollhouse/shared";
import { inferRoom } from "./roomAssigner.js";
import type { LLMProvider } from "./providers/LLMProvider.js";

export type { LLMProvider } from "./providers/LLMProvider.js";

/**
 * Mock provider — splits the prompt by ' and ' / ',' / newlines, then assigns
 * an agent type by keyword. Zero external deps so the system works offline.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async plan(userPrompt: string): Promise<DelegatorPlan> {
    const fragments = userPrompt
      .split(/\band\b|[,;\n]/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const tasks: Task[] = (fragments.length > 0 ? fragments : [userPrompt]).map(
      (f) => ({
        agentType: pickAgent(f),
        subtask: f,
        assignedRoom: inferRoom(f),
      }),
    );

    return {
      plan: `Mock plan — ${tasks.length} subtask(s) routed by keyword.`,
      tasks,
    };
  }
}

function pickAgent(fragment: string): AgentType {
  const l = fragment.toLowerCase();
  if (/(test|debug)/.test(l)) return "echo";
  if (/(ui|frontend|component|css|design)/.test(l)) return "echo";
  if (/(api|backend|server|db)/.test(l)) return "echo";
  return "echo";
}

/**
 * Pluggable orchestrator. Provider is injected at construction (see
 * `providers/index.ts` for the env-driven factory).
 */
export class Delegator {
  constructor(private provider: LLMProvider = new MockProvider()) {}

  setProvider(p: LLMProvider): void {
    this.provider = p;
  }

  get providerName(): string {
    return this.provider.name;
  }

  async plan(userPrompt: string, cwd: string): Promise<DelegatorPlan> {
    return this.provider.plan(userPrompt, { cwd });
  }
}

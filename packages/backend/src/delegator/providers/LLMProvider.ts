import type {
  AgentType,
  DelegatorPlan,
  Task,
} from "@dollhouse/shared";
import { availableAgentTypes } from "../../agents/AgentRegistry.js";
import { validateRoom } from "../roomAssigner.js";

export interface LLMProvider {
  name: string;
  plan(userPrompt: string, ctx: { cwd: string }): Promise<DelegatorPlan>;
}

/**
 * Coerce loose JSON from any provider into the canonical DelegatorPlan shape,
 * dropping anything obviously malformed. Falls back to echo+workshop for any
 * agent type that isn't currently registered.
 */
export function coercePlan(raw: unknown): DelegatorPlan {
  const obj = raw as Partial<DelegatorPlan> | undefined;
  const available = new Set(availableAgentTypes());

  const rawTasks = Array.isArray(obj?.tasks) ? obj!.tasks : [];
  const tasks: Task[] = rawTasks
    .filter((t): t is Task =>
      Boolean(t && typeof (t as Task).subtask === "string"),
    )
    .map((t) => {
      const type = (t as Task).agentType;
      const agentType: AgentType = available.has(type) ? type : "echo";
      return {
        agentType,
        subtask: (t as Task).subtask,
        assignedRoom: validateRoom(
          (t as Task).assignedRoom,
          (t as Task).subtask,
        ),
      };
    });

  return {
    plan: typeof obj?.plan === "string" ? obj.plan : "(no plan provided)",
    tasks: tasks.length > 0 ? tasks : [],
  };
}

/** Strip optional ```json fences from a model response. */
export function stripJsonFence(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

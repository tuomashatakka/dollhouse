import { ALL_ROOM_IDS, ROOM_COORDS } from "@dollhouse/shared";
import { availableAgentTypes } from "../agents/AgentRegistry.js";

export function buildSystemPrompt(): string {
  const rooms = ALL_ROOM_IDS.filter((r) => r !== "spawnPoint")
    .map((r) => {
      const def = ROOM_COORDS[r];
      return `  - "${r}" (${def.label}): ${def.kinds.join(", ")}`;
    })
    .join("\n");
  const agents = availableAgentTypes().join(", ");

  return `You are the Delegator, the head of the household in a 3D virtual dollhouse populated by worker AI agents. A human submits a single high-level coding task. Your job is to break it into 1-5 concrete subtasks and assign each to an agent + a room in the dollhouse.

Available worker agent types: ${agents}
Available rooms:
${rooms}

Rules:
  - Each subtask must be self-contained and runnable by a single agent.
  - "claude-code", "gemini-cli", "opencode" are best for code generation/editing.
  - "ollama" / "apfel" are local models, prefer them for quick / lightweight reasoning.
  - "echo" is a mock agent — use only as a last resort or for demos.
  - Match the room to the subtask's nature (UI work → studio, backend → workshop, docs → library, etc.).

Return ONLY valid JSON of the shape:
{
  "plan": "one-paragraph summary of the strategy",
  "tasks": [
    { "agentType": "...", "subtask": "...", "assignedRoom": "..." }
  ]
}`;
}

export const PLAN_JSON_SCHEMA = {
  type: "object",
  required: ["plan", "tasks"],
  properties: {
    plan: { type: "string" },
    tasks: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        required: ["agentType", "subtask", "assignedRoom"],
        properties: {
          agentType: { type: "string" },
          subtask: { type: "string" },
          assignedRoom: { type: "string" },
        },
      },
    },
  },
} as const;

import type { RoomId } from "./rooms.js";

export type AgentType =
  | "claude-code"
  | "gemini-cli"
  | "opencode"
  | "ollama"
  | "apfel"
  | "echo";

export const ALL_AGENT_TYPES: AgentType[] = [
  "claude-code",
  "gemini-cli",
  "opencode",
  "ollama",
  "apfel",
  "echo",
];

export type AgentStatus = "spawning" | "walking" | "working" | "idle" | "exited" | "error";

export interface Task {
  agentType: AgentType;
  subtask: string;
  assignedRoom: RoomId;
}

export interface DelegatorPlan {
  plan: string;
  tasks: Task[];
}

import type { AgentType, DelegatorPlan } from "./agents.js";
import type { RoomId } from "./rooms.js";

// Client -> Server
export interface ClientToServerEvents {
  set_workspace: (p: { path: string; isGit: boolean }) => void;
  submit_master_task: (p: { prompt: string }) => void;
  agent_input: (p: { agentId: string; input: string }) => void;
  kill_agent: (p: { agentId: string }) => void;
  ping: () => void;
}

// Server -> Client
export interface ServerToClientEvents {
  heartbeat: (p: { ts: number }) => void;
  workspace_ready: (p: {
    path: string;
    status: "success" | "error";
    message?: string;
  }) => void;
  delegator_plan: (p: DelegatorPlan) => void;
  agent_spawned: (p: {
    agentId: string;
    type: AgentType;
    assignedRoom: RoomId;
    pid?: number;
    label: string;
  }) => void;
  agent_stdout: (p: { agentId: string; data: string }) => void;
  agent_exit: (p: { agentId: string; code: number }) => void;
  log: (p: { level: "info" | "warn" | "error"; message: string }) => void;
}

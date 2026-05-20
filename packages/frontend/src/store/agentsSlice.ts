import type { AgentStatus, AgentType, RoomId } from "@dollhouse/shared";
import type { StateCreator } from "zustand";

export interface AgentState {
  id: string;
  type: AgentType;
  label: string;
  room: RoomId;
  status: AgentStatus;
  lastActivityAt: number;
  /** Cap on stored log lines (xterm replays history when terminal mounts). */
  logLines: string[];
  pid?: number;
}

const LOG_CAP = 1000;

// Idle decay: after this much silence since last stdout chunk, flip
// status from "working" back to "idle".
const WORKING_TTL_MS = 1500;

export interface AgentsSlice {
  agents: Record<string, AgentState>;
  activeAgentId: string | null;
  spawnAgent: (a: Omit<AgentState, "status" | "lastActivityAt" | "logLines">) => void;
  appendStdout: (agentId: string, data: string) => void;
  markIdleIfStale: () => void;
  markExited: (agentId: string, code: number) => void;
  removeAgent: (agentId: string) => void;
  setActiveAgent: (agentId: string | null) => void;
  setStatus: (agentId: string, status: AgentStatus) => void;
}

export const createAgentsSlice: StateCreator<AgentsSlice> = (set, get) => ({
  agents: {},
  activeAgentId: null,

  spawnAgent: (a) =>
    set((s) => ({
      agents: {
        ...s.agents,
        [a.id]: {
          ...a,
          status: "walking",
          lastActivityAt: Date.now(),
          logLines: [],
        },
      },
      activeAgentId: s.activeAgentId ?? a.id,
    })),

  appendStdout: (agentId, data) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      const next: AgentState = {
        ...existing,
        // If still walking, keep walking until the spring resolves; otherwise
        // flip to working.
        status: existing.status === "walking" ? "walking" : "working",
        lastActivityAt: Date.now(),
        logLines: [...existing.logLines, data].slice(-LOG_CAP),
      };
      return { agents: { ...s.agents, [agentId]: next } };
    }),

  markIdleIfStale: () => {
    const now = Date.now();
    const updates: Record<string, AgentState> = {};
    const ags = get().agents;
    for (const a of Object.values(ags)) {
      if (
        a.status === "working" &&
        now - a.lastActivityAt > WORKING_TTL_MS
      ) {
        updates[a.id] = { ...a, status: "idle" };
      }
    }
    if (Object.keys(updates).length === 0) return;
    set((s) => ({ agents: { ...s.agents, ...updates } }));
  },

  markExited: (agentId, code) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      const tag = code === 0 ? "✓ exited cleanly" : `✗ exited code ${code}`;
      return {
        agents: {
          ...s.agents,
          [agentId]: {
            ...existing,
            status: "exited",
            logLines: [...existing.logLines, `\r\n\x1b[2m[${tag}]\x1b[0m\r\n`],
          },
        },
      };
    }),

  removeAgent: (agentId) =>
    set((s) => {
      const { [agentId]: _gone, ...rest } = s.agents;
      const nextActive =
        s.activeAgentId === agentId
          ? (Object.keys(rest)[0] ?? null)
          : s.activeAgentId;
      return { agents: rest, activeAgentId: nextActive };
    }),

  setActiveAgent: (agentId) => set({ activeAgentId: agentId }),

  setStatus: (agentId, status) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      return { agents: { ...s.agents, [agentId]: { ...existing, status } } };
    }),
});

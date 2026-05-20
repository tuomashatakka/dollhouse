import type { StateCreator } from "zustand";

export interface WorkspaceSlice {
  workspacePath: string | null;
  workspaceStatus: "idle" | "loading" | "ready" | "error";
  workspaceMessage: string | null;
  connected: boolean;
  logs: { level: "info" | "warn" | "error"; message: string; ts: number }[];
  setWorkspace: (s: Partial<{
    workspacePath: string | null;
    workspaceStatus: WorkspaceSlice["workspaceStatus"];
    workspaceMessage: string | null;
  }>) => void;
  setConnected: (c: boolean) => void;
  pushLog: (l: { level: "info" | "warn" | "error"; message: string }) => void;
}

export const createWorkspaceSlice: StateCreator<WorkspaceSlice> = (set) => ({
  workspacePath: null,
  workspaceStatus: "idle",
  workspaceMessage: null,
  connected: false,
  logs: [],
  setWorkspace: (s) => set(s),
  setConnected: (c) => set({ connected: c }),
  pushLog: ({ level, message }) =>
    set((st) => ({
      logs: [...st.logs.slice(-199), { level, message, ts: Date.now() }],
    })),
});

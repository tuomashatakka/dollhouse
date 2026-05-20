import { create } from "zustand";
import { createAgentsSlice, type AgentsSlice } from "./agentsSlice.js";
import { createDelegatorSlice, type DelegatorSlice } from "./delegatorSlice.js";
import { createWorkspaceSlice, type WorkspaceSlice } from "./workspaceSlice.js";

export type AppStore = AgentsSlice & DelegatorSlice & WorkspaceSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createAgentsSlice(...a),
  ...createDelegatorSlice(...a),
  ...createWorkspaceSlice(...a),
}));

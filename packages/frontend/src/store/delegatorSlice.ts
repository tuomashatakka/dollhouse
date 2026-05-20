import type { DelegatorPlan } from "@dollhouse/shared";
import type { StateCreator } from "zustand";

export interface DelegatorSlice {
  lastPlan: DelegatorPlan | null;
  setPlan: (p: DelegatorPlan) => void;
}

export const createDelegatorSlice: StateCreator<DelegatorSlice> = (set) => ({
  lastPlan: null,
  setPlan: (p) => set({ lastPlan: p }),
});

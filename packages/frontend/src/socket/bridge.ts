import { useEffect } from "react";
import { useStore } from "../store/index.js";
import { getSocket } from "./client.js";

/**
 * Wires Socket.IO events into the Zustand store. Mount once at the App root.
 */
export function useSocketBridge(): void {
  useEffect(() => {
    const socket = getSocket();
    const s = useStore.getState();

    const onConnect = () => s.setConnected(true);
    const onDisconnect = () => s.setConnected(false);
    const onHeartbeat = () => {
      /* no-op for now */
    };
    const onLog: Parameters<typeof socket.on<"log">>[1] = (p) => s.pushLog(p);

    const onWorkspaceReady: Parameters<
      typeof socket.on<"workspace_ready">
    >[1] = ({ path, status, message }) => {
      s.setWorkspace({
        workspacePath: path,
        workspaceStatus: status === "success" ? "ready" : "error",
        workspaceMessage: message ?? null,
      });
    };

    const onPlan: Parameters<typeof socket.on<"delegator_plan">>[1] = (p) =>
      s.setPlan(p);

    const onSpawn: Parameters<typeof socket.on<"agent_spawned">>[1] = (p) =>
      s.spawnAgent({
        id: p.agentId,
        type: p.type,
        room: p.assignedRoom,
        label: p.label,
        pid: p.pid,
      });

    const onStdout: Parameters<typeof socket.on<"agent_stdout">>[1] = (p) =>
      s.appendStdout(p.agentId, p.data);

    const onExit: Parameters<typeof socket.on<"agent_exit">>[1] = (p) =>
      s.markExited(p.agentId, p.code);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("heartbeat", onHeartbeat);
    socket.on("log", onLog);
    socket.on("workspace_ready", onWorkspaceReady);
    socket.on("delegator_plan", onPlan);
    socket.on("agent_spawned", onSpawn);
    socket.on("agent_stdout", onStdout);
    socket.on("agent_exit", onExit);

    // Idle decay ticker — flips agents from "working" → "idle" after the TTL.
    const decayTimer = setInterval(() => s.markIdleIfStale(), 500);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("heartbeat", onHeartbeat);
      socket.off("log", onLog);
      socket.off("workspace_ready", onWorkspaceReady);
      socket.off("delegator_plan", onPlan);
      socket.off("agent_spawned", onSpawn);
      socket.off("agent_stdout", onStdout);
      socket.off("agent_exit", onExit);
      clearInterval(decayTimer);
    };
  }, []);
}

// Action helpers that send messages to the backend.
export const socketActions = {
  setWorkspace(path: string, isGit = false): void {
    useStore.setState({ workspaceStatus: "loading" });
    getSocket().emit("set_workspace", { path, isGit });
  },
  submitMasterTask(prompt: string): void {
    getSocket().emit("submit_master_task", { prompt });
  },
  agentInput(agentId: string, input: string): void {
    getSocket().emit("agent_input", { agentId, input });
  },
  killAgent(agentId: string): void {
    getSocket().emit("kill_agent", { agentId });
  },
};

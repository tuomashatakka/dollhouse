import type { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@dollhouse/shared";
import { AgentCoordinator } from "../agents/AgentCoordinator.js";
import { Delegator } from "../delegator/Delegator.js";
import { WorkspaceManager } from "../workspace/WorkspaceManager.js";
import type { IO } from "./server.js";

// One coordinator + workspace per socket connection so multi-tab use is clean.
// Delegator is shared across sessions (it holds a single LLM client).
interface SessionState {
  workspace: WorkspaceManager;
  coordinator: AgentCoordinator;
}

const sessions = new WeakMap<Socket, SessionState>();

function sessionFor(socket: Socket): SessionState {
  let s = sessions.get(socket);
  if (!s) {
    s = {
      workspace: new WorkspaceManager(),
      coordinator: new AgentCoordinator(),
    };
    sessions.set(socket, s);
  }
  return s;
}

export function registerHandlers(
  _io: IO,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  delegator: Delegator,
): void {
  const session = sessionFor(socket);

  socket.on("ping", () => socket.emit("heartbeat", { ts: Date.now() }));

  socket.on("set_workspace", async ({ path, isGit }) => {
    try {
      const ws = await session.workspace.set(path, isGit);
      socket.emit("workspace_ready", { path: ws.path, status: "success" });
      socket.emit("log", {
        level: "info",
        message: `Workspace ready: ${ws.path}`,
      });
    } catch (err) {
      socket.emit("workspace_ready", {
        path,
        status: "error",
        message: (err as Error).message,
      });
    }
  });

  socket.on("submit_master_task", async ({ prompt }) => {
    const ws = session.workspace.get();
    if (!ws) {
      socket.emit("log", {
        level: "error",
        message: "Set a workspace before submitting a task.",
      });
      return;
    }

    let plan;
    try {
      plan = await delegator.plan(prompt, ws.path);
    } catch (err) {
      socket.emit("log", {
        level: "error",
        message: `Delegator failed: ${(err as Error).message}`,
      });
      return;
    }
    socket.emit("delegator_plan", plan);

    for (const task of plan.tasks) {
      session.coordinator.spawn(
        {
          type: task.agentType,
          subtask: task.subtask,
          assignedRoom: task.assignedRoom,
          cwd: ws.path,
        },
        {
          onSpawn: (a) => {
            socket.emit("agent_spawned", {
              agentId: a.id,
              type: a.type,
              assignedRoom: a.assignedRoom,
              pid: a.transport.pid,
              label: a.label,
            });
            if (a.fellBack) {
              socket.emit("log", {
                level: "warn",
                message: `Agent type "${task.agentType}" not yet wired — fell back to echo for "${task.subtask}"`,
              });
            }
          },
          onData: (agentId, data) => socket.emit("agent_stdout", { agentId, data }),
          onExit: (agentId, code) => socket.emit("agent_exit", { agentId, code }),
          onError: (agentId, err) =>
            socket.emit("log", {
              level: "error",
              message: `Agent ${agentId}: ${err.message}`,
            }),
        },
      );
    }
  });

  socket.on("agent_input", ({ agentId, input }) => {
    if (!session.coordinator.write(agentId, input)) {
      socket.emit("log", {
        level: "warn",
        message: `agent_input: unknown agentId ${agentId}`,
      });
    }
  });

  socket.on("kill_agent", ({ agentId }) => {
    if (!session.coordinator.kill(agentId)) {
      socket.emit("log", {
        level: "warn",
        message: `kill_agent: unknown agentId ${agentId}`,
      });
    }
  });

  socket.on("disconnect", () => {
    session.coordinator.killAll();
  });
}

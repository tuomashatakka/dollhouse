import type { AgentType, RoomId } from "@dollhouse/shared";
import { nanoid } from "nanoid";
import { resolveSpec } from "./AgentRegistry.js";
import type { AgentTransport } from "./transports/AgentTransport.js";

export interface SpawnInput {
  type: AgentType;
  subtask: string;
  cwd: string;
  assignedRoom: RoomId;
}

export interface SpawnedAgent {
  id: string;
  type: AgentType;
  label: string;
  assignedRoom: RoomId;
  transport: AgentTransport;
  fellBack: boolean;
}

export type AgentEventHandlers = {
  onSpawn: (a: SpawnedAgent) => void;
  onData: (agentId: string, data: string) => void;
  onExit: (agentId: string, code: number) => void;
  onError: (agentId: string, err: Error) => void;
};

export class AgentCoordinator {
  private agents = new Map<string, SpawnedAgent>();

  spawn(input: SpawnInput, handlers: AgentEventHandlers): SpawnedAgent {
    const { spec, fellBack } = resolveSpec(input.type);
    const transport = spec.build({ subtask: input.subtask, cwd: input.cwd });
    const agent: SpawnedAgent = {
      id: nanoid(8),
      type: input.type,
      label: spec.label,
      assignedRoom: input.assignedRoom,
      transport,
      fellBack,
    };
    this.agents.set(agent.id, agent);

    transport.on("data", (chunk) => handlers.onData(agent.id, chunk));
    transport.on("exit", (code) => {
      handlers.onExit(agent.id, code);
      this.agents.delete(agent.id);
    });
    transport.on("error", (err) => handlers.onError(agent.id, err));

    handlers.onSpawn(agent);
    return agent;
  }

  write(agentId: string, input: string): boolean {
    const a = this.agents.get(agentId);
    if (!a) return false;
    a.transport.write(input);
    return true;
  }

  kill(agentId: string): boolean {
    const a = this.agents.get(agentId);
    if (!a) return false;
    a.transport.kill();
    return true;
  }

  killAll(): void {
    for (const a of this.agents.values()) a.transport.kill();
    this.agents.clear();
  }

  get(agentId: string): SpawnedAgent | undefined {
    return this.agents.get(agentId);
  }

  list(): SpawnedAgent[] {
    return [...this.agents.values()];
  }
}

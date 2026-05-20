import { EchoTransport } from "../transports/EchoTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

export const echoSpec: AgentSpec = {
  type: "echo",
  label: "Echo (mock)",
  build: ({ subtask, cwd }) => new EchoTransport({ subtask, cwd }),
};

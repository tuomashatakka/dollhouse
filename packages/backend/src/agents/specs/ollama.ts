import { env } from "../../env.js";
import {
  HttpStreamTransport,
  ollamaExtractor,
} from "../transports/HttpStreamTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

export const ollamaSpec: AgentSpec = {
  type: "ollama",
  label: `Ollama (${env.OLLAMA_MODEL})`,
  build: ({ subtask, cwd }) =>
    new HttpStreamTransport({
      url: `${env.OLLAMA_HOST}/api/generate`,
      body: {
        model: env.OLLAMA_MODEL,
        prompt: `You are a worker agent in the DollhouseDev environment.\nWorking directory: ${cwd}\n\nSubtask: ${subtask}`,
        stream: true,
      },
      extract: ollamaExtractor,
      preamble: `\x1b[33m🦙 ollama\x1b[0m ${env.OLLAMA_MODEL}  \x1b[2m${env.OLLAMA_HOST}\x1b[0m\r\n\r\n`,
    }),
};

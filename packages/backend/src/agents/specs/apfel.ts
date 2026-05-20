import { env } from "../../env.js";
import {
  HttpStreamTransport,
  ollamaExtractor,
  sseExtractor,
} from "../transports/HttpStreamTransport.js";
import type { AgentSpec } from "../AgentRegistry.js";

/**
 * Apfel local model server (Apple Foundation Models) at default port 11436.
 * Many local Apple-foundation servers expose either Ollama-style NDJSON or
 * an OpenAI-compatible SSE endpoint. We try the OpenAI-compatible path first
 * (closer to the official format) and fall back to the Ollama-style on miss.
 */
export const apfelSpec: AgentSpec = {
  type: "apfel",
  label: `Apfel (${env.APFEL_MODEL})`,
  build: ({ subtask, cwd }) => {
    const url = `${env.APFEL_HOST}/v1/chat/completions`;
    return new HttpStreamTransport({
      url,
      body: {
        model: env.APFEL_MODEL,
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a worker agent in the DollhouseDev environment. Working directory: ${cwd}.`,
          },
          { role: "user", content: subtask },
        ],
      },
      // Apfel/AFM servers vary; sseExtractor handles OpenAI-style streams,
      // ollamaExtractor handles raw NDJSON. We pick sse first and fall back
      // to ollama if no content comes through (best-effort).
      extract: (line) => sseExtractor(line) ?? ollamaExtractor(line),
      preamble: `\x1b[35m🍎 apfel\x1b[0m ${env.APFEL_MODEL}  \x1b[2m${env.APFEL_HOST}\x1b[0m\r\n\r\n`,
    });
  },
};

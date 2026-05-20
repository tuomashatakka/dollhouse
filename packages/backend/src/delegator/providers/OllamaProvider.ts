import { fetch } from "undici";
import { env } from "../../env.js";
import { buildSystemPrompt } from "../prompt.js";
import {
  coercePlan,
  stripJsonFence,
  type LLMProvider,
} from "./LLMProvider.js";
import type { DelegatorPlan } from "@dollhouse/shared";

interface OllamaChatResponse {
  message?: { content?: string };
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  async plan(userPrompt: string, ctx: { cwd: string }): Promise<DelegatorPlan> {
    const res = await fetch(`${env.OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: `Working directory: ${ctx.cwd}\n\nUser task:\n${userPrompt}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as OllamaChatResponse;
    const text = json.message?.content ?? "{}";
    try {
      return coercePlan(JSON.parse(stripJsonFence(text)));
    } catch {
      return coercePlan({});
    }
  }
}

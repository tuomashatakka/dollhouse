import OpenAI from "openai";
import { env } from "../../env.js";
import { buildSystemPrompt } from "../prompt.js";
import {
  coercePlan,
  stripJsonFence,
  type LLMProvider,
} from "./LLMProvider.js";
import type { DelegatorPlan } from "@dollhouse/shared";

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private client: OpenAI;

  constructor() {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }
    this.client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/dollhousedev",
        "X-Title": "DollhouseDev",
      },
    });
  }

  async plan(userPrompt: string, ctx: { cwd: string }): Promise<DelegatorPlan> {
    const resp = await this.client.chat.completions.create({
      model: env.OPENROUTER_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Working directory: ${ctx.cwd}\n\nUser task:\n${userPrompt}\n\nRespond with ONLY the JSON object — no prose.`,
        },
      ],
    });

    const text = resp.choices[0]?.message.content ?? "{}";
    try {
      return coercePlan(JSON.parse(stripJsonFence(text)));
    } catch {
      return coercePlan({});
    }
  }
}

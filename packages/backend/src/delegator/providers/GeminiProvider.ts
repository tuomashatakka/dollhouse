import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../env.js";
import { buildSystemPrompt } from "../prompt.js";
import {
  coercePlan,
  stripJsonFence,
  type LLMProvider,
} from "./LLMProvider.js";
import type { DelegatorPlan } from "@dollhouse/shared";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenerativeAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async plan(userPrompt: string, ctx: { cwd: string }): Promise<DelegatorPlan> {
    const model = this.client.getGenerativeModel({
      model: env.GEMINI_MODEL,
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(
      `Working directory: ${ctx.cwd}\n\nUser task:\n${userPrompt}`,
    );
    const text = result.response.text();
    try {
      return coercePlan(JSON.parse(stripJsonFence(text)));
    } catch {
      return coercePlan({});
    }
  }
}

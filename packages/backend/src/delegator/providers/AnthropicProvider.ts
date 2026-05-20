import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";
import { buildSystemPrompt, PLAN_JSON_SCHEMA } from "../prompt.js";
import { coercePlan, type LLMProvider } from "./LLMProvider.js";
import type { DelegatorPlan } from "@dollhouse/shared";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async plan(userPrompt: string, ctx: { cwd: string }): Promise<DelegatorPlan> {
    // Use tool-use to force structured output.
    const resp = await this.client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: [
        {
          name: "submit_plan",
          description: "Submit the delegation plan to the dollhouse.",
          input_schema: PLAN_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_plan" },
      messages: [
        {
          role: "user",
          content: `Working directory: ${ctx.cwd}\n\nUser task:\n${userPrompt}`,
        },
      ],
    });

    const toolBlock = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    return coercePlan(toolBlock?.input);
  }
}

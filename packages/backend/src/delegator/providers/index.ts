import { env } from "../../env.js";
import { MockProvider } from "../Delegator.js";
import type { LLMProvider } from "./LLMProvider.js";

export async function createProvider(): Promise<LLMProvider> {
  switch (env.LLM_PROVIDER) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./AnthropicProvider.js");
      return new AnthropicProvider();
    }
    case "openrouter": {
      const { OpenRouterProvider } = await import("./OpenRouterProvider.js");
      return new OpenRouterProvider();
    }
    case "gemini": {
      const { GeminiProvider } = await import("./GeminiProvider.js");
      return new GeminiProvider();
    }
    case "ollama": {
      const { OllamaProvider } = await import("./OllamaProvider.js");
      return new OllamaProvider();
    }
    case "mock":
    default:
      return new MockProvider();
  }
}

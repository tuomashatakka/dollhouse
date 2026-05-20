import "dotenv/config";
import { z } from "zod";

const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),

  LLM_PROVIDER: z
    .enum(["mock", "anthropic", "openrouter", "gemini", "ollama"])
    .default("mock"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  OLLAMA_HOST: z.string().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.2"),

  APFEL_HOST: z.string().default("http://127.0.0.1:11436"),
  APFEL_MODEL: z.string().default("apple-foundation"),
});

export type Env = z.infer<typeof Schema>;

export const env: Env = Schema.parse(process.env);

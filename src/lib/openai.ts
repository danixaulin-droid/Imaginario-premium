import OpenAI from "openai";
import { mustEnv } from "@/lib/env";

/**
 * Cria e reutiliza o client OpenAI.
 * - Evita múltiplas instâncias desnecessárias
 * - Compatível com Next.js 15 + Vercel
 */
let client: OpenAI | null = null;

export function getOpenAI() {
  if (client) return client;

  const apiKey = mustEnv("OPENAI_API_KEY");

  client = new OpenAI({
    apiKey,
  });

  return client;
}

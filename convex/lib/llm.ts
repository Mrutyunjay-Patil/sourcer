import OpenAI from "openai";

/**
 * One OpenAI client for every model call. Base URL and model come from the
 * deployment environment so the same code runs against api.openai.com or an
 * OpenAI-compatible gateway serving OpenAI's gpt-oss models.
 */
export function openai(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this deployment.");
  return new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
}

export function modelName(): string {
  return process.env.OPENAI_MODEL || "gpt-5.6";
}

export type Usage = { inputTokens: number; outputTokens: number };

/**
 * Ask for JSON and return the parsed object. Some gateways ignore
 * response_format, so we also tolerate prose around the JSON body.
 */
export async function completeJson<T>(
  system: string,
  user: string,
  options?: { maxTokens?: number; attempts?: number },
): Promise<{ value: T; usage: Usage; raw: string }> {
  const client = openai();
  const attempts = options?.attempts ?? 3;
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let lastRaw = "";
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await client.chat.completions.create({
      model: modelName(),
      messages: [
        { role: "system", content: system + (attempt > 0 ? " Respond with the JSON object only, no prose." : "") },
        { role: "user", content: user },
      ],
      temperature: attempt === 0 ? 0.1 : 0.3,
      max_tokens: options?.maxTokens ?? 1500,
      response_format: { type: "json_object" },
    });
    usage.inputTokens += res.usage?.prompt_tokens ?? 0;
    usage.outputTokens += res.usage?.completion_tokens ?? 0;
    lastRaw = res.choices[0]?.message?.content ?? "";
    try {
      return { value: extractJson<T>(lastRaw), usage, raw: lastRaw };
    } catch (err) {
      lastError = err;
      console.warn(`completeJson attempt ${attempt + 1} failed: ${(err as Error).message}; raw=${lastRaw.slice(0, 200)}`);
    }
  }
  throw new Error(`Model did not return JSON after ${attempts} attempts: ${(lastError as Error)?.message ?? ""}`);
}

export async function completeText(
  system: string,
  user: string,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; usage: Usage }> {
  const client = openai();
  const res = await client.chat.completions.create({
    model: modelName(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: options?.temperature ?? 0.4,
    max_tokens: options?.maxTokens ?? 800,
  });
  return {
    text: (res.choices[0]?.message?.content ?? "").trim(),
    usage: {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    },
  };
}

export function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error("Model did not return JSON.");
  }
}

export function clamp01(n: unknown, fallback = 0): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

export function num(n: unknown): number | undefined {
  if (n === null || n === undefined || n === "") return undefined;
  const x = typeof n === "number" ? n : Number(String(n).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : undefined;
}

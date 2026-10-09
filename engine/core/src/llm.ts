const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";
const API = "https://openrouter.ai/api/v1/chat/completions";

export function hasLLM(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

interface ORUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

function logUsage(model: string, usage: ORUsage | undefined, label: string): void {
  if (!usage) return;
  const cost = usage.cost != null ? ` $${usage.cost.toFixed(4)}` : "";
  console.log(
    `[llm] ${label} ${model} in=${usage.prompt_tokens ?? "?"} out=${usage.completion_tokens ?? "?"}${cost}`,
  );
}

async function post(body: Record<string, unknown>, attempt = 0): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-title": "latere",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return post(body, attempt + 1);
  }
  return res;
}

export async function chat(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number; label?: string } = {},
): Promise<string> {
  const res = await post({
    model: MODEL,
    temperature: opts.temperature ?? 0.9,
    max_tokens: opts.maxTokens ?? 1024,
    usage: { include: true },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: ORUsage;
  };
  logUsage(MODEL, json.usage, opts.label ?? "chat");
  return json.choices?.[0]?.message?.content ?? "";
}

export function parseJsonBlock<T>(out: string, shape: "array" | "object"): T {
  const re = shape === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = out.match(re);
  if (!match) throw new Error(`LLM did not return JSON ${shape}. Got: ${out.slice(0, 160)}`);
  return JSON.parse(match[0]) as T;
}

const IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

export function hasImageGen(): boolean {
  return hasLLM();
}

export interface GeneratedImage {
  data: Buffer;
  ext: string;
}

export async function generateImage(prompt: string, aspect = "9:16"): Promise<GeneratedImage> {
  const res = await post({
    model: IMAGE_MODEL,
    modalities: ["image", "text"],
    image_config: { aspect_ratio: aspect },
    usage: { include: true },
    messages: [{ role: "user", content: prompt }],
  });
  if (!res.ok)
    throw new Error(`OpenRouter image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    usage?: ORUsage;
  };
  logUsage(IMAGE_MODEL, json.usage, "image");
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
  const m = url.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!m) throw new Error(`image model returned no data URL (${url.slice(0, 60) || "empty"})`);
  return { data: Buffer.from(m[2]!, "base64"), ext: m[1] === "jpeg" ? "jpg" : m[1]! };
}

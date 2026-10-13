// Tiny OpenRouter client. Every call is appended to runs.jsonl with tokens + cost,
// so you can see exactly what "just ask the model" costs.
import { appendFileSync, readFileSync, existsSync } from "node:fs";

// Round A calls (tag "A:…") spend key A, everything else spends key B. Run `node start.mjs` to set them.
function loadKey(tag) {
  const name = tag.startsWith("A") ? "OPENROUTER_KEY_A" : "OPENROUTER_KEY_B";
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (process.env[name]) return process.env[name];
  if (existsSync(".env")) {
    const m = readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  throw new Error(`Missing ${name}. Run: node start.mjs`);
}

export const MODELS = {
  cheap: [
    "anthropic/claude-haiku-5.5",
    "openai/gpt-6-luna-pro",
    "google/gemini-3.8-flash",
    "deepseek/deepseek-v4.1-flash",
    "qwen/qwen3.8-flash",
    "mistralai/mistral-small-2603",
    "z-ai/glm-5.3-flash",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  premium: ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol"],
};

export async function ask(model, prompt, { system, reasoning, maxTokens = 4000, tag = "" } = {}) {
  const t0 = Date.now();
  const body = {
    model,
    messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
    max_tokens: maxTokens,
    usage: { include: true },
  };
  if (reasoning === false) body.reasoning = { enabled: false };
  else if (reasoning) body.reasoning = { effort: reasoning };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${loadKey(tag)}`, "Content-Type": "application/json", "X-Title": "OpenSlava Lazy Genius lab" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? res.statusText;
    return { model, ok: false, error: `${res.status} ${msg}`, text: "", cost: 0, ms: Date.now() - t0 };
  }
  const u = json.usage ?? {};
  const out = {
    model,
    ok: true,
    text: json.choices?.[0]?.message?.content ?? "",
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    cost: u.cost ?? 0,
    ms: Date.now() - t0,
  };
  appendFileSync("runs.jsonl", JSON.stringify({ at: new Date().toISOString(), tag, ...out, text: out.text.slice(0, 500) }) + "\n");
  return out;
}

export const usd = (n) => `$${n.toFixed(n < 0.01 ? 5 : 3)}`;

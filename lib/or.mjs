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

// Same as ask(), but streams: onReasoning(text) / onText(text) fire as tokens arrive.
export async function askStream(model, prompt, { maxTokens = 8000, tag = "", onReasoning = () => {}, onText = () => {} } = {}) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${loadKey(tag)}`, "Content-Type": "application/json", "X-Title": "OpenSlava Lazy Genius lab" },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, stream: true, usage: { include: true },
      // Claude streams its thinking via OpenRouter only with an explicit budget (effort / include_reasoning show nothing).
      // The budget must stay below max_tokens so there is room left for the answer.
      ...(model.startsWith("anthropic/") ? { reasoning: { max_tokens: Math.min(2048, Math.floor(maxTokens / 2)) } } : {}),
    }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message ?? msg; } catch {}
    return { model, ok: false, error: `${res.status} ${msg}`, text: "", cost: 0, ms: Date.now() - t0 };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", usage = {}, error = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) error = j.error.message ?? "stream error";
      const d = j.choices?.[0]?.delta ?? {};
      if (d.reasoning) onReasoning(d.reasoning);
      if (d.content) { text += d.content; onText(d.content); }
      if (j.usage) usage = j.usage;
    }
  }
  const out = {
    model,
    ok: !error,
    error,
    text,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cost: usage.cost ?? 0,
    ms: Date.now() - t0,
  };
  appendFileSync("runs.jsonl", JSON.stringify({ at: new Date().toISOString(), tag, ...out, text: out.text.slice(0, 500) }) + "\n");
  return out;
}

// $/token and context window (tokens, 0 = unknown) for a model, from OpenRouter's public model list.
export async function priceOf(model) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const m = (await r.json()).data.find((x) => x.id === model || x.canonical_slug === model);
    return { in: Number(m.pricing.prompt), out: Number(m.pricing.completion), ctx: Number(m.context_length ?? m.top_provider?.context_length) || 0 };
  } catch {
    return { in: 0, out: 0, ctx: 0 };
  }
}

export const usd = (n) => `$${n.toFixed(n < 0.01 ? 5 : 3)}`;

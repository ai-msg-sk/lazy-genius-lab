// Round A vs Round B on your own numbers: score, cost, tokens, seconds.
// Shared by compare.mjs (the finale) and badge.mjs (the shareable badge).
//   A = the last "A:paste" run in my-work/receipts.jsonl (or runs.jsonl), scored against the hashes.
//   B = my-work/answers.json (or answers.json) scored against the hashes; cost = the B:write runs since the last B:write:1,
//       or (Round B done in Claude Code) the real spend of key B from OpenRouter.
// Missing runs are filled with the speaker's reference numbers (ref: true).
import { readFileSync, existsSync } from "node:fs";
import { check } from "./check.mjs";

const LAB = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, LAB), "utf8");
const has = (f) => existsSync(new URL(f, LAB));
// Attendee outputs live in my-work/ (fallback: the lab root, older layout).
const pick = (...fs) => fs.find(has) ?? fs.at(-1);

const tok = (r) => (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
const scoreOf = (obj) => { try { return check(obj).filter((x) => x.ok).length; } catch { return null; } };
const jsonIn = (text) => JSON.parse(text.match(/\{[\s\S]*\}/)[0]);

export function readRuns() {
  const f = pick("my-work/receipts.jsonl", "runs.jsonl");
  if (!has(f)) return [];
  return read(f).trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// → { A, B, bScore }   A/B = { score, cost, tokens, secs, ref }.  bScore = answers.json score (null: no Round B yet).
export async function loadResults({ online = true } = {}) {
  const runs = readRuns();

  const lastA = runs.filter((r) => r.tag?.startsWith("A:paste") && r.ok).at(-1);
  let A = { score: 0, cost: 0.151, tokens: 170_638, secs: 52.6, ref: true };
  if (lastA) {
    let s = null;
    try { s = scoreOf(jsonIn(lastA.text)); } catch {}
    A = { score: s ?? 0, cost: lastA.cost, tokens: tok(lastA), secs: lastA.ms / 1000, ref: false };
  }

  const iFirst = runs.map((r) => r.tag).lastIndexOf("B:write:1");
  const bRuns = iFirst >= 0 ? runs.slice(iFirst).filter((r) => r.tag?.startsWith("B:")) : [];
  let bScore = null;
  try {
    const ans = JSON.parse(read(pick("my-work/answers.json", "answers.json")));
    let aAns = null;
    try { aAns = lastA ? jsonIn(lastA.text) : null; } catch {}
    // answers.json still holds Round A's guess → Round B hasn't happened yet
    if (!aAns || JSON.stringify(ans) !== JSON.stringify(aAns)) bScore = scoreOf(ans);
  } catch {}

  let B = { score: bScore ?? 5, cost: 0.0137, tokens: 21_000, secs: 2.6, ref: true };
  if (bRuns.length) B = { score: bScore, cost: bRuns.reduce((s, r) => s + (r.cost ?? 0), 0), tokens: bRuns.reduce((s, r) => s + tok(r), 0), secs: 2.6, ref: false };
  else if (bScore !== null && online) {
    // Round B done with Claude Code: tokens aren't logged here, so take the real spend of key B from OpenRouter.
    try {
      const key = read(".env").match(/^OPENROUTER_KEY_B=(.+)$/m)[1].trim();
      const j = await (await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })).json();
      B = { score: bScore, cost: j.data.usage ?? 0, tokens: null, secs: 2.6, ref: false };
    } catch {}
  }
  return { A, B, bScore };
}

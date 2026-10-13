// The finale: Round A vs Round B on your own numbers, then what it means for a real team.
// Usage: node compare.mjs [--devs 10] [--per-day 20] [--days 220] [--reports 20]
import { readFileSync, existsSync } from "node:fs";
import { check } from "./lib/check.mjs";
import { showQR } from "./lib/qr.mjs";
import { brandLine, step, note, nextBox, cmd, c, fg, sleep, isTTY, out, vis } from "./lib/tui.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const DEVS = arg("devs", 10), PER_DAY = arg("per-day", 20), DAYS = arg("days", 220), REPORTS = arg("reports", 20);

// ── your runs ─────────────────────────────────────────────────────────────────────
const runs = existsSync("runs.jsonl") ? readFileSync("runs.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const tok = (r) => (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
const scoreOf = (obj) => { try { return check(obj).filter((x) => x.ok).length; } catch { return null; } };

const lastA = runs.filter((r) => r.tag?.startsWith("A:paste") && r.ok).at(-1);
let A = { score: 0, cost: 0.151, tokens: 170_638, secs: 52.6, ref: true };
if (lastA) {
  let s = null;
  try { s = scoreOf(JSON.parse(lastA.text.match(/\{[\s\S]*\}/)[0])); } catch {}
  A = { score: s ?? 0, cost: lastA.cost, tokens: tok(lastA), secs: lastA.ms / 1000, ref: false };
}

const iFirst = runs.map((r) => r.tag).lastIndexOf("B:write:1");
const bRuns = iFirst >= 0 ? runs.slice(iFirst).filter((r) => r.tag?.startsWith("B:")) : [];
let bScore = null;
try {
  const ans = JSON.parse(readFileSync("answers.json", "utf8"));
  const aAns = lastA ? JSON.parse(lastA.text.match(/\{[\s\S]*\}/)[0]) : null;
  // answers.json still holds Round A's guess → Round B hasn't happened yet
  if (!aAns || JSON.stringify(ans) !== JSON.stringify(aAns)) bScore = scoreOf(ans);
} catch {}
let B = { score: bScore ?? 5, cost: 0.0137, tokens: 21_000, secs: 2.6, ref: true };
if (bRuns.length) B = { score: bScore, cost: bRuns.reduce((s, r) => s + (r.cost ?? 0), 0), tokens: bRuns.reduce((s, r) => s + tok(r), 0), secs: 2.6, ref: false };
else if (bScore !== null) {
  // Round B done with Claude Code: tokens aren't logged here, so take the real spend of key B from OpenRouter.
  try {
    const key = readFileSync(".env", "utf8").match(/^OPENROUTER_KEY_B=(.+)$/m)[1].trim();
    const j = await (await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } })).json();
    B = { score: bScore, cost: j.data.usage ?? 0, tokens: null, secs: 2.6, ref: false };
  } catch {}
}

// ── helpers ───────────────────────────────────────────────────────────────────────
const money = (n) => (n >= 1000 ? `$${Math.round(n).toLocaleString("en")}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);
const big = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);
const W = Math.max(20, Math.min((process.stdout.columns || 80) - 46, 44));
const ease = (t) => 1 - Math.pow(1 - t, 3);

async function race(label, a, b, fmt, { lowerIsBetter = true } = {}) {
  const max = Math.max(a, b) || 1;
  const row = (name, v, col, t) => {
    const n = Math.max(v > 0 ? 1 : 0, Math.round((W * v * ease(t)) / max));
    return `    ${c.grey}${name}${c.reset} ${col}${"█".repeat(n)}${c.grey}${"·".repeat(W - n)}${c.reset} ${c.white}${c.bold}${fmt(v * ease(t))}${c.reset}`;
  };
  out(`  ${c.bold}${label}${c.reset}\n`);
  const frames = isTTY ? 18 : 1;
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    if (f > 1) out("\x1b[2A");
    out(`\r\x1b[2K${row("A", a, fg(161), t)}\n\r\x1b[2K${row("B", b, fg(141), t)}\n`);
    if (isTTY) await sleep(28);
  }
  const better = lowerIsBetter ? b < a : b > a;
  if (a && b && better) note(`B is ${c.reset}${c.green}${c.bold}${lowerIsBetter ? (a / b).toFixed(0) + "× less" : "better"}${c.reset}`);
  out("\n");
}

async function roll(label, value, fmt, color = c.white) {
  const frames = isTTY ? 24 : 1;
  for (let f = 1; f <= frames; f++) {
    out(`\r\x1b[2K    ${c.grey}${label.padEnd(30)}${c.reset}${color}${c.bold}${fmt(value * ease(f / frames))}${c.reset}`);
    if (isTTY) await sleep(22);
  }
  out("\n");
}

async function type(s, ms = 9) {
  if (!isTTY) return out(s + "\n");
  let shown = "";
  for (const ch of s) { shown += ch; out(ch); if (ch !== " ") await sleep(ms); }
  out("\n");
}

// ── the show ──────────────────────────────────────────────────────────────────────
await brandLine("Round A vs Round B");
out("\n");
step(`Same task, two ways${A.ref || B.ref ? `  ${c.grey}(missing runs filled with the speaker's reference numbers)${c.reset}` : ""}`);
out("\n");
if (B.score === null) note(`Round B answers not found (answers.json still has Round A's). Run ${cmd("node verify.mjs")} after Round B, then compare again.`);
else await race("Correct answers  (out of 5)", A.score, B.score, (v) => `${Math.round(v)}/5`, { lowerIsBetter: false });
await race("Cost per answer", A.cost, B.cost, money);
if (A.tokens && B.tokens) await race("Tokens sent and received", A.tokens, B.tokens, big);
await race("Time to the answer  (B: your laptop running the code)", A.secs, B.secs, (v) => `${v.toFixed(1)} s`);

const xCost = B.cost ? A.cost / B.cost : 0, xTime = A.secs / B.secs;
out(`  ${c.green}${c.bold}B was ${xCost.toFixed(0)}× cheaper, ${xTime.toFixed(0)}× faster${B.score === null ? "" : B.score === 5 ? ", and right" : `, and ${B.score}/5 right`}.${c.reset}`);
out(`  ${c.grey}A was ${A.score}/5.${c.reset}\n\n`);
if (isTTY) await sleep(400);

// ── real life ─────────────────────────────────────────────────────────────────────
const yearlyRuns = DEVS * PER_DAY * DAYS;
step(`Now scale it: ${DEVS} devs × ${PER_DAY} questions like this a day × ${DAYS} working days`);
note(`= ${yearlyRuns.toLocaleString("en")} answers a year. A pays every time. B's code is written once per report (${REPORTS} reports) and then runs for free.`);
out("\n");
await roll("Way A, a year of pasting", A.cost * yearlyRuns, money, fg(161));
await roll("Way B, writing the code", B.cost * REPORTS, money, fg(141));
if (A.tokens) await roll("Tokens burned by A", A.tokens * yearlyRuns, big, fg(161));
await roll("Hours waiting for A", (A.secs * yearlyRuns) / 3600, (v) => `${Math.round(v).toLocaleString("en")} h`, fg(161));
await roll("Hours waiting for B", (B.secs * yearlyRuns) / 3600, (v) => `${Math.round(v).toLocaleString("en")} h`, fg(141));
await roll("Wrong answers from A", yearlyRuns * (1 - A.score / 5), (v) => Math.round(v).toLocaleString("en"), c.red);
out("\n");

step("Why it matters");
for (const line of [
  `${c.white}Right${c.reset}       ${c.grey}a guess that looks confident is worse than no answer. Code is checked by a test.${c.reset}`,
  `${c.white}Cheap${c.reset}       ${c.grey}tokens scale with the data. Code costs once, then reruns at $0.${c.reset}`,
  `${c.white}Fast${c.reset}        ${c.grey}a laptop reads 150,000 rows in seconds. A model reads ~3 % of them in a minute.${c.reset}`,
  `${c.white}Repeatable${c.reset}  ${c.grey}same input, same output. Run it again next month, it still agrees.${c.reset}`,
  `${c.white}Auditable${c.reset}   ${c.grey}you can read the code. You can't read why a model guessed 7,127.${c.reset}`,
]) await type(`    ${line}`);
out("\n");
out(`  ${c.bold}AI writes. Code runs. AI checks.${c.reset}  ${c.grey}Put that rule in your CLAUDE.md tomorrow morning.${c.reset}\n`);

nextBox([
  `Write both columns on your sheet. Lowest Round B cost with 5/5 wins ElevenLabs Pro.`,
  ``,
  `When we're done:  ${cmd("node cleanup.mjs")}`,
]);

await showQR({ seconds: 25 });

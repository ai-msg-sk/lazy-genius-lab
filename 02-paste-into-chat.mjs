// Round A (key A): the way most people do it. Paste what fits into one AI message and ask.
// The whole workbook is ~150k rows; this sends what you'd get by copy-pasting
// the Program sheet and the first 4,000 rating rows from Excel.
// Usage: node 02-paste-into-chat.mjs [model=google/gemini-3.8-flash]
import { readFileSync, writeFileSync } from "node:fs";
import { askStream, priceOf } from "./lib/or.mjs";
import { check } from "./lib/check.mjs";
import { banner, step, note, progress, live, wave, clip, revealChecks, scoreBox, sleep, c, SPIN, isTTY } from "./lib/tui.mjs";

const model = process.argv[2] ?? "google/gemini-3.8-flash";
const excerpt = readFileSync(new URL("./data/paste-excerpt.txt", import.meta.url), "utf8");
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const rows = excerpt.split("\n").length;

await banner("ROUND A", "let the AI guess · key A");

step("Copying the spreadsheet into one chat message");
await progress(`${(excerpt.length / 1024).toFixed(0)} KB pasted. The full Excel has 150,000 rows; this is all that fits.`, rows, { unit: "rows" });

const price = await priceOf(model);
const promptTokensEst = Math.round((task.length + excerpt.length) / 1.6); // spreadsheets tokenize badly: ~1.6 chars/token
const lines = excerpt.split("\n").filter((l) => l.includes("\t"));
step(`Asking ${c.violet}${model}${c.reset}${c.bold} for the 5 numbers`);
note(`~${promptTokensEst.toLocaleString("en")} tokens of spreadsheet in one prompt`);
out("\n");

const t0 = Date.now();
let thinking = "", reasoningChars = 0, textChars = 0, phase = "thinking";
// the prompt cost lands while the model reads (ramped over ~4 s), output cost as tokens stream in
const costNow = () => promptTokensEst * price.in * Math.min(1, (Date.now() - t0) / 4000) + ((reasoningChars + textChars) / 3.6) * price.out;
const ticker = live((f) => {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  const tok = Math.round((reasoningChars + textChars) / 3.6).toLocaleString("en");
  const label = phase === "thinking" ? "reading " : "writing ";
  // While the model works silently, show what it is chewing on: the pasted rows, scrolling by.
  const row = lines[(f * 37) % lines.length].replace(/\t+/g, " · ");
  const side = thinking ? `${c.violet}thinks:${c.reset} ${c.dim}${clip(thinking.replace(/\s+/g, " "), 40)}` : `${c.violet}row ${((f * 37) % lines.length + 1).toLocaleString("en").padStart(5)}:${c.reset} ${c.dim}${row.slice(0, 40)}`;
  return `    ${c.pink}${SPIN[f % 10]}${c.reset} ${c.white}${label}${c.reset} ${c.grey}${s}s${c.reset} ${c.violet}${wave(f, phase === "thinking" ? 1 : 0.6)}${c.reset} ${c.yellow}${c.bold}$${costNow().toFixed(4)}${c.reset}  ${side}${c.reset}`;
});

let answerShown = false;
const res = await askStream(
  model,
  `${task}\n\nHere is the data I copied from the Excel:\n\n${excerpt}\n\n` +
    `Answer the five questions as best you can from this. Do not write code. Reply with only the answers.json content.`,
  {
    tag: "A:paste",
    onReasoning: (t) => { thinking += t; reasoningChars += t.length; },
    onText: (t) => { phase = "answering"; textChars += t.length; },
  },
);
const secs = (Date.now() - t0) / 1000;
ticker.stop(`    ${c.green}✓${c.reset} ${c.white}answer received${c.reset} ${c.grey}in ${secs.toFixed(1)}s · ${res.promptTokens.toLocaleString("en")} tokens in · ${res.completionTokens.toLocaleString("en")} out (${res.reasoningTokens.toLocaleString("en")} thinking)${c.reset}`);

if (!res.ok) {
  out(`\n  ${c.red}${c.bold}✗ ${res.error}${c.reset}\n`);
  process.exit(1);
}

out("\n");
step("The AI says");
out("    ");
const json = res.text.match(/\{[\s\S]*\}/)?.[0] ?? res.text;
for (const ch of json) { out(`${c.white}${ch === "\n" ? "\n    " : ch}${c.reset}`); if (isTTY && ch !== " ") await sleep(6); }
out("\n\n");
answerShown = true;

let parsed = null;
try { parsed = JSON.parse(json); writeFileSync("answers.json", json); } catch {}
if (!parsed) { out(`  ${c.red}The answer is not valid JSON, so nothing to check.${c.reset}\n`); process.exit(1); }

step("Checking against the real numbers");
const results = check(parsed);
await revealChecks(results);
scoreBox({ score: results.filter((r) => r.ok).length, cost: res.cost || costNow(), seconds: secs, round: "A" });

function out(s) { process.stdout.write(s); }

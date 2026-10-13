// Round A (key A): the way most people do it. Paste what fits into one AI message and ask.
// The whole workbook is ~150k rows; this sends what fits when you copy-paste the first few %
// of every sheet (data/paste-excerpt.txt, one "### <sheet> (first N of M rows)" section per sheet).
// Usage: node 02-paste-into-chat.mjs [model=google/gemini-3.8-flash]
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { ANSWERS, ensureWork } from "./lib/paths.mjs";
import { askStream, priceOf } from "./lib/or.mjs";
import { check } from "./lib/check.mjs";
import { brandLine, banner, step, note, bar, revealChecks, scoreBox, nextBox, cmd, sleep, wrap, cols, c, isTTY, ASCII } from "./lib/tui.mjs";
import { carouselPanel, pasteScenes } from "./lib/carousel.mjs";
import { ROUND_B_PROMPT, copyToClipboard } from "./lib/clipboard.mjs";
import { excelZoom } from "./lib/excelzoom.mjs";

// hidden: --zoom-only plays just the spreadsheet zoom-out + coverage bars and exits (no API call)
const zoomOnly = process.argv.includes("--zoom-only");
if (zoomOnly) process.argv.splice(process.argv.indexOf("--zoom-only"), 1);
const model = process.argv[2] ?? "google/gemini-3.8-flash";
const excerpt = readFileSync(new URL("./data/paste-excerpt.txt", import.meta.url), "utf8");
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const sheets = [...excerpt.matchAll(/^### (.+?) \(first ([\d,]+) of ([\d,]+) rows\)/gm)].map((m) => ({ name: m[1], n: Number(m[2].replace(/,/g, "")), of: Number(m[3].replace(/,/g, "")) }));
const seen = sheets.reduce((s, x) => s + x.n, 0), all = sheets.reduce((s, x) => s + x.of, 0);
const pct = all ? Math.round((seen / all) * 100) : 0;

if (!zoomOnly) {
  await brandLine("Round A");
  await banner("ROUND A", "let the AI guess · key A");
}

step("Copying the spreadsheet into one chat message");
// close-up of the sheet → Ctrl+C → zoom out to the whole workbook; the bars below are the resting state
let fullRows = all;
try { fullRows = JSON.parse(readFileSync(new URL("./data/sizes.json", import.meta.url), "utf8")).fullRows || all; } catch {}
await excelZoom({ sheets, excerpt, total: fullRows });
const nameW = Math.max(...sheets.map((x) => x.name.length));
for (const x of sheets) await bar(x.name.padEnd(nameW), x.n / x.of, `${`${x.n.toLocaleString("en")} / ${x.of.toLocaleString("en")} rows`.padEnd(20)}${c.grey}${((x.n / x.of) * 100).toFixed(0).padStart(3)} %`, 260);
if (zoomOnly) process.exit(0);
// Honest sizes: 3 % is our choice for this round, not a hard limit. The real limit is the model's context window.
const price = await priceOf(model);
const BYTES_PER_TOKEN = 1.72; // measured: a 281 KB prompt of this spreadsheet = 163,597 tokens
let sizes = {};
try { sizes = JSON.parse(readFileSync(new URL("./data/sizes.json", import.meta.url), "utf8")); } catch {}
const promptTokensEst = Math.round((Buffer.byteLength(task) + Buffer.byteLength(excerpt)) / BYTES_PER_TOKEN);
const kTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : `${Math.round(n / 1000)}k`);
const money = (n) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
note(`${(Buffer.byteLength(excerpt) / 1024).toFixed(0)} KB pasted: ${seen.toLocaleString("en")} of ${(sizes.fullRows ?? all).toLocaleString("en")} rows (${pct} %), ~${kTok(promptTokensEst)} tokens${price.in ? `, ~${money(promptTokensEst * price.in)}` : ""}.`);
let whole = null;
if (sizes.fullBytes) {
  const fullTok = sizes.fullBytes / BYTES_PER_TOKEN;
  const maxPct = price.ctx ? Math.min(100, Math.round(((price.ctx / fullTok) * 100) / 5) * 5 || 1) : 0;
  whole = { tokens: fullTok, ctx: price.ctx, maxPct };
  const xlsxMB = (statSync(new URL("./data/openslava-2026-export.xlsx", import.meta.url)).size / 1e6).toFixed(1);
  let s = `The .xlsx file is ${xlsxMB} MB (it's zipped); copied out as text it's ${(sizes.fullBytes / 1e6).toFixed(1)} MB ≈ ${kTok(fullTok)} tokens.`;
  if (price.ctx && price.ctx < fullTok)
    s += ` ${model} reads at most ${kTok(price.ctx)} tokens (~${maxPct} % of the rows)${price.in ? `, and that would cost ~${money(price.ctx * price.in)} per question` : ""}. It can never see all of it.`;
  else if (price.ctx)
    s += ` ${model} could take it all${price.in ? `, for ~${money(fullTok * price.in)} per question` : ""}, and it would still be reading, not counting.`;
  note(s);
}
out("\n");

const lines = excerpt.split("\n").filter((l) => l.includes("\t"));
step(`Asking ${c.violet}${model}${c.reset}${c.bold} for the 5 numbers`);
note(`~${promptTokensEst.toLocaleString("en")} tokens of spreadsheet in one prompt`);
out("\n");

const t0 = Date.now();
let reasoningChars = 0, textChars = 0;
// the prompt cost lands while the model reads (ramped over ~4 s), output cost as tokens stream in
const costNow = () => promptTokensEst * price.in * Math.min(1, (Date.now() - t0) / 4000) + ((reasoningChars + textChars) / 3.6) * price.out;
// While the model works silently, a carousel of scenes (what it sees / doesn't see / money / facts / poll);
// the moment real reasoning or the answer streams in, the panel shows that instead.
const outTok = () => (reasoningChars + textChars) / 3.6;
const panel = carouselPanel({
  model,
  stats: () => ({ tok: outTok(), cost: costNow() }),
  feed: lines,
  rows: 8,
  scenes: pasteScenes({ feed: lines, promptTokens: promptTokensEst, whole, tokens: () => promptTokensEst * Math.min(1, (Date.now() - t0) / 4000) + outTok() }),
  feedTitle: "reading your Excel…",
  writeTitle: "writing the answer…",
});

const res = await askStream(
  model,
  `${task}\n\n${excerpt}\n\n` +
    `Here is what fit from each sheet of the export (the first few % of each sheet). Answer the five questions. ` +
    `If the data is incomplete, give your best estimate for the full export — do not answer 0 or null. ` +
    `Do not write code. Reply with only the answers.json content.`,
  {
    tag: "A:paste",
    onReasoning: (t) => { reasoningChars += t.length; panel.reason(t); },
    onText: (t) => { textChars += t.length; panel.write(t); },
  },
);
const secs = (Date.now() - t0) / 1000;
panel.stop(res.ok
  ? `    ${c.green}✓${c.reset} ${c.white}thought for ${secs.toFixed(1)}s${c.reset} ${c.grey}· ${res.reasoningTokens.toLocaleString("en")} reasoning tokens · $${(res.cost || costNow()).toFixed(3)}${c.reset}\n` +
    `    ${c.grey}  ${res.promptTokens.toLocaleString("en")} tokens in · ${res.completionTokens.toLocaleString("en")} out${c.reset}`
  : `    ${c.red}✗${c.reset} ${c.white}no answer after ${secs.toFixed(1)}s${c.reset}`);

if (!res.ok) {
  out(`\n  ${c.red}${c.bold}✗ ${res.error}${c.reset}\n`);
  nextBox([`Check your key:  ${cmd("node start.mjs")}  ${c.grey}or raise your hand${c.reset}`], c.red);
  process.exit(1);
}

out("\n");
step("The AI says");
out("    ");
const json = res.text.match(/\{[\s\S]*\}/)?.[0] ?? res.text;
for (const ch of json) { out(`${c.white}${ch === "\n" ? "\n    " : ch}${c.reset}`); if (isTTY && ch !== " ") await sleep(6); }
out("\n\n");

let parsed = null;
try { parsed = JSON.parse(json); ensureWork(); writeFileSync(ANSWERS, json); } catch {}
if (!parsed) {
  // Some models refuse to guess from 3 % of the data. That's an honest answer, and still 0/5 for the report.
  out(`  ${c.yellow}${c.bold}The AI refused to guess.${c.reset} ${c.grey}Honest, but the sponsors still have no numbers at 10:00.${c.reset}\n`);
  out(`  ${c.grey}Notice what it suggests instead: write code over the full export. That's Round B.${c.reset}\n`);
  scoreBox({ score: 0, cost: res.cost || costNow(), seconds: secs, round: "A" });
  const copied = await copyToClipboard(ROUND_B_PROMPT).catch(() => false);
  nextBox([
    `1  Write 0/5 and the cost on your sheet (Round A column)`,
    `2  Round B, let the AI write code:`,
    `     ${cmd("claude")}   then paste (Cmd+V / Ctrl+V)${copied ? ". Copied to your clipboard." : ": " + ROUND_B_PROMPT}`,
    `     No Claude Code?  ${cmd("node 03-orchestrator.mjs")}`,
    ``,
    `${c.grey}Want to see a model that does guess?${c.reset}  ${cmd("node 02-paste-into-chat.mjs google/gemini-3.8-flash")}`,
  ]);
  process.exit(0);
}

step("Checking against the real numbers");
const results = check(parsed);
await revealChecks(results);
scoreBox({ score: results.filter((r) => r.ok).length, cost: res.cost || costNow(), seconds: secs, round: "A" });
out(`  ${c.white}The AI saw about ${c.bold}${pct} %${c.reset}${c.white} of the rows and guessed the rest.${c.reset}\n`);
const copied = copyToClipboard(ROUND_B_PROMPT);
const promptW = Math.max(30, Math.min(cols() - 18, 76));
nextBox([
  `1  Write your score and cost on the sheet ${c.grey}(Round A column)${c.reset}`,
  `2  Round B, let the AI write code:`,
  `     ${cmd("claude")}   ${c.grey}${copied ? "then paste (Cmd+V / Ctrl+V). Copied to your clipboard:" : "then type this prompt:"}${c.reset}`,
  ...wrap(ROUND_B_PROMPT, promptW).map((l) => `     ${c.violet}${ASCII ? "|" : "┊"} ${l}${c.reset}`),
  `     ${c.grey}lost it?${c.reset}  ${cmd("node prompt.mjs")}`,
  `     ${c.grey}No Claude Code?${c.reset}  ${cmd("node 03-orchestrator.mjs")}`,
  ``,
  `${c.grey}A bigger model guessing too?  $ node 02-paste-into-chat.mjs openai/gpt-6.1-sol${c.reset}`,
]);

function out(s) { process.stdout.write(s); }

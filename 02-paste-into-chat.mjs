// Round A (key A): the way most people do it. Paste what fits into one AI message and ask.
// The whole workbook is ~150k rows; this sends what fits when you copy-paste the first few %
// of every sheet (data/paste-excerpt.txt, one "### <sheet> (first N of M rows)" section per sheet).
// Usage: node 02-paste-into-chat.mjs [model=google/gemini-3.8-flash]
import { readFileSync, writeFileSync } from "node:fs";
import { askStream, priceOf } from "./lib/or.mjs";
import { check } from "./lib/check.mjs";
import { brandLine, banner, step, note, bar, thinkPanel, revealChecks, scoreBox, nextBox, cmd, sleep, c, isTTY } from "./lib/tui.mjs";

const model = process.argv[2] ?? "google/gemini-3.8-flash";
const excerpt = readFileSync(new URL("./data/paste-excerpt.txt", import.meta.url), "utf8");
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const sheets = [...excerpt.matchAll(/^### (.+?) \(first ([\d,]+) of ([\d,]+) rows\)/gm)].map((m) => ({ name: m[1], n: Number(m[2].replace(/,/g, "")), of: Number(m[3].replace(/,/g, "")) }));
const seen = sheets.reduce((s, x) => s + x.n, 0), all = sheets.reduce((s, x) => s + x.of, 0);
const pct = all ? Math.round((seen / all) * 100) : 0;

brandLine("Round A");
await banner("ROUND A", "let the AI guess · key A");

step("Copying the spreadsheet into one chat message");
const nameW = Math.max(...sheets.map((x) => x.name.length));
for (const x of sheets) await bar(x.name.padEnd(nameW), x.n / x.of, `${`${x.n.toLocaleString("en")} / ${x.of.toLocaleString("en")} rows`.padEnd(20)}${c.grey}${((x.n / x.of) * 100).toFixed(0).padStart(3)} %`, 260);
note(`${(excerpt.length / 1024).toFixed(0)} KB pasted: ${seen.toLocaleString("en")} of ${all.toLocaleString("en")} rows (${pct} %). That is all that fits in one message.`);
out("\n");

const price = await priceOf(model);
const promptTokensEst = Math.round((task.length + excerpt.length) / 1.6); // spreadsheets tokenize badly: ~1.6 chars/token
const lines = excerpt.split("\n").filter((l) => l.includes("\t"));
step(`Asking ${c.violet}${model}${c.reset}${c.bold} for the 5 numbers`);
note(`~${promptTokensEst.toLocaleString("en")} tokens of spreadsheet in one prompt`);
out("\n");

const t0 = Date.now();
let reasoningChars = 0, textChars = 0;
// the prompt cost lands while the model reads (ramped over ~4 s), output cost as tokens stream in
const costNow = () => promptTokensEst * price.in * Math.min(1, (Date.now() - t0) / 4000) + ((reasoningChars + textChars) / 3.6) * price.out;
// While the model works silently, the panel shows what it is chewing on: the pasted rows, scrolling by.
const panel = thinkPanel({
  model,
  stats: () => ({ tok: (reasoningChars + textChars) / 3.6, cost: costNow() }),
  feed: lines,
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
try { parsed = JSON.parse(json); writeFileSync("answers.json", json); } catch {}
if (!parsed) {
  out(`  ${c.red}The answer is not valid JSON, so nothing to check.${c.reset}\n`);
  nextBox([`Try again or another model:  ${cmd("node 02-paste-into-chat.mjs")}`, `Or move on to Round B:  ${cmd("claude")}  ${c.grey}or${c.reset}  ${cmd("node 03-orchestrator.mjs")}`]);
  process.exit(1);
}

step("Checking against the real numbers");
const results = check(parsed);
await revealChecks(results);
scoreBox({ score: results.filter((r) => r.ok).length, cost: res.cost || costNow(), seconds: secs, round: "A" });
out(`  ${c.white}The AI saw about ${c.bold}${pct} %${c.reset}${c.white} of the rows and guessed the rest.${c.reset}\n`);
nextBox([
  `1  Write your score and cost on the sheet ${c.grey}(Round A column)${c.reset}`,
  `2  Round B, let the AI write code:`,
  `     ${cmd("claude")}   ${c.grey}then paste the prompt from your sheet${c.reset}`,
  `     ${c.grey}No Claude Code?${c.reset}  ${cmd("node 03-orchestrator.mjs")}`,
  ``,
  `${c.grey}A bigger model guessing too?  $ node 02-paste-into-chat.mjs openai/gpt-6.1-sol${c.reset}`,
]);

function out(s) { process.stdout.write(s); }

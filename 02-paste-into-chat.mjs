// Round A (use key A): the way most people do it. Paste what fits into the prompt and ask.
// The whole workbook is ~150k rows; this sends the excerpt you'd get by copy-pasting
// the Program sheet and the first 4,000 rating rows from Excel.
// Usage: node 02-paste-into-chat.mjs [model=google/gemini-3.8-flash]
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ask, usd } from "./lib/or.mjs";

const model = process.argv[2] ?? "google/gemini-3.8-flash";
const excerpt = readFileSync(new URL("./data/paste-excerpt.txt", import.meta.url), "utf8");
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");

console.log(`Pasting ${(excerpt.length / 1024).toFixed(0)} KB of spreadsheet into ${model} ...`);
const res = await ask(
  model,
  `${task}\n\nHere is the data I copied from the Excel:\n\n${excerpt}\n\n` +
    `Answer the five questions as best you can from this. Do not write code. Reply with only the answers.json content.`,
  { tag: "A:paste", maxTokens: 8000 },
);
if (!res.ok) {
  console.log("Failed:", res.error);
  process.exit(1);
}
console.log(res.text);
console.log(`\ntokens in ${res.promptTokens} · out ${res.completionTokens} (reasoning ${res.reasoningTokens}) · ${usd(res.cost)} · ${(res.ms / 1000).toFixed(1)} s\n`);
const json = res.text.match(/\{[\s\S]*\}/)?.[0];
if (json) {
  writeFileSync("answers.json", json);
  execFileSync("node", ["verify.mjs"], { stdio: "inherit" });
}

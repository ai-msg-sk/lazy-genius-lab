// Round B without an IDE agent (use key B). The Lazy Genius loop:
//   writer model  -> writes a Python program        (cheap, creative)
//   your laptop   -> runs it on the full 150k rows   (deterministic, free)
//   checker model -> reviews the code against TASK  (different vendor, different blind spots)
// Usage: node 03-orchestrator.mjs [writer] [checker]
// Generated code runs on your laptop. Read it (generated/) before you trust it.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ask, usd } from "./lib/or.mjs";

const writer = process.argv[2] ?? "anthropic/claude-haiku-5.5";
const checker = process.argv[3] ?? "openai/gpt-6-luna-pro";
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const preview = readFileSync(new URL("./data/preview.txt", import.meta.url), "utf8");
mkdirSync("generated", { recursive: true });

const code = (s) => (s.match(/```(?:python|py)?\n([\s\S]*?)```/) ?? [, s])[1];
let spent = 0;
let feedback = "";

for (let round = 1; round <= 3; round++) {
  console.log(`\n── round ${round}: ${writer} writes ──`);
  const w = await ask(
    writer,
    `${task}\n\nFirst rows of each sheet (tab-separated):\n${preview}\n\n` +
      `Write ONE Python 3 program using only the standard library (zipfile, re, xml, json, collections, datetime). ` +
      `It reads data/openslava-2026-export.xlsx (inline strings: <c t="inlineStr"><is><t>, numbers: <v>), ` +
      `computes the five answers exactly as specified and writes answers.json. Use integer cents for money.` +
      (feedback ? `\n\nYour previous attempt was rejected:\n${feedback}` : "") +
      `\nReply with a single \`\`\`python code block only.`,
    { tag: `B:write:${round}`, maxTokens: 16000, reasoning: "low" },
  );
  spent += w.cost;
  if (!w.ok) throw new Error(w.error);
  if (!w.text.trim()) { feedback = "You returned no code (thinking budget ran out). Think less, write the program."; console.log("∅ empty reply"); continue; }
  const file = `generated/solve-r${round}.py`;
  writeFileSync(file, code(w.text));

  let out;
  try {
    out = execFileSync("python3", [file], { encoding: "utf8", timeout: 120_000 });
  } catch (e) {
    feedback = `It crashed:\n${String(e.stderr || e.message).slice(-1500)}`;
    console.log("💥 crashed, sending the traceback back");
    continue;
  }
  if (!existsSync("answers.json")) { feedback = "It ran but did not write answers.json."; console.log("no answers.json written"); continue; }
  console.log("ran locally on all rows:", out.trim().slice(0, 300) || "(no stdout)");

  console.log(`── ${checker} reviews ──`);
  const c = await ask(
    checker,
    `${task}\n\nHere is a program that claims to solve this:\n\`\`\`python\n${readFileSync(file, "utf8")}\n\`\`\`\n` +
      `Do NOT compute anything yourself. Review only whether the code implements every rule in the task ` +
      `(dedupe, badge resolution, rating validity, latest rating, Bayesian formula, storno/TEST, booking status and overlap). ` +
      `Reply "APPROVED" or "REJECTED: <rule> <what is wrong>".`,
    { tag: `B:check:${round}`, maxTokens: 4000 },
  );
  spent += c.cost;
  console.log(c.text.trim().slice(0, 600));
  if (/^\s*APPROVED/i.test(c.text)) break;
  feedback = c.text;
}

console.log(`\nLLM spend for the whole loop: ${usd(spent)}`);
if (existsSync("answers.json")) execFileSync("node", ["verify.mjs"], { stdio: "inherit" });

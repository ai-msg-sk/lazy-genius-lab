// Round B without an IDE agent (key B). The Lazy Genius loop:
//   writer model  -> writes a Python program        (cheap, creative)
//   your laptop   -> runs it on the full 150k rows   (deterministic, free)
//   checker model -> reviews the code against TASK  (different vendor, different blind spots)
// Usage: node 03-orchestrator.mjs [writer] [checker]
// Generated code runs on your laptop. Read it (generated/) before you trust it.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { askStream, priceOf } from "./lib/or.mjs";
import { check } from "./lib/check.mjs";
import { banner, step, note, live, wave, clip, revealChecks, scoreBox, checkLine, c, SPIN } from "./lib/tui.mjs";

const run = promisify(execFile);
const writer = process.argv[2] ?? "anthropic/claude-haiku-5.5";
const checker = process.argv[3] ?? "openai/gpt-6-luna-pro";
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const preview = readFileSync(new URL("./data/preview.txt", import.meta.url), "utf8");
mkdirSync("generated", { recursive: true });
const out = (s) => process.stdout.write(s);

// Windows ships "python", macOS/Linux "python3"
const PY = await (async () => { for (const p of [process.platform === "win32" ? "python" : "python3", "python3", "python"]) { try { await run(p, ["--version"]); return p; } catch {} } return "python3"; })();
const code = (s) => (s.match(/```(?:python|py)?\n([\s\S]*?)```/) ?? [, s])[1];

await banner("ROUND B", "let the AI write code · key B");
note(`writer ${c.violet}${writer}${c.grey} · runtime ${c.violet}your laptop${c.grey} · checker ${c.violet}${checker}`);
out("\n");

const [pw, pc] = await Promise.all([priceOf(writer), priceOf(checker)]);
let spent = 0, feedback = "";
const t0 = Date.now();

async function streamed(model, price, prompt, verb, tag) {
  const tStart = Date.now();
  let text = "", reasoning = 0;
  const inTok = Math.round(prompt.length / 3.6);
  const tick = live((f) => {
    const lines = text.split("\n");
    const last = lines.filter((l) => l.trim()).at(-1) ?? "";
    const cost = inTok * price.in + ((text.length + reasoning) / 3.6) * price.out;
    const right = text ? `${c.grey}${String(lines.length).padStart(3)} lines${c.reset}  ${c.dim}${clip(last.trim(), 44)}` : `${c.grey}thinking…${c.reset}`;
    return `    ${c.pink}${SPIN[f % 10]}${c.reset} ${c.white}${verb}${c.reset} ${c.grey}${((Date.now() - tStart) / 1000).toFixed(1).padStart(5)}s${c.reset} ${c.violet}${wave(f)}${c.reset} ${c.yellow}${c.bold}$${cost.toFixed(4)}${c.reset}  ${right}${c.reset}`;
  });
  const r = await askStream(model, prompt, { tag, maxTokens: 16000, onReasoning: (t) => (reasoning += t.length), onText: (t) => (text += t) });
  spent += r.cost;
  tick.stop(r.ok
    ? `    ${c.green}✓${c.reset} ${verb} ${c.grey}${((Date.now() - tStart) / 1000).toFixed(1)}s · ${text.split("\n").length} lines · $${r.cost.toFixed(4)}${c.reset}`
    : `    ${c.red}✗ ${verb}: ${r.error}${c.reset}`);
  return r;
}

let approved = false;
for (let round = 1; round <= 3 && !approved; round++) {
  step(`Attempt ${round}`);
  const w = await streamed(writer, pw,
    `${task}\n\nFirst rows of each sheet (tab-separated):\n${preview}\n\n` +
      `Write ONE Python 3 program using only the standard library (zipfile, re, xml, json, collections, datetime). ` +
      `It reads data/openslava-2026-export.xlsx (inline strings: <c t="inlineStr"><is><t>, numbers: <v>), ` +
      `computes the five answers exactly as specified and writes answers.json. Use integer cents for money.` +
      (feedback ? `\n\nYour previous attempt was rejected:\n${feedback}` : "") +
      `\nReply with a single \`\`\`python code block only. Keep any thinking short.`,
    "writer writes the program", `B:write:${round}`);
  if (!w.ok) process.exit(1);
  if (!w.text.trim()) { feedback = "You returned no code. Think less, write the program."; continue; }
  const file = `generated/solve-r${round}.py`;
  writeFileSync(file, code(w.text));
  rmSync("answers.json", { force: true });

  const ran = await checkLine(`your laptop runs it on all 150,000 rows  ${c.grey}${file}${c.reset}`, async () => {
    const t = Date.now();
    try { await run(PY, [file], { timeout: 120_000 }); }
    catch (e) { feedback = `It crashed:\n${String(e.stderr || e.message).slice(-1500)}`; return [false, "crashed, sending the error back to the writer"]; }
    if (!existsSync("answers.json")) { feedback = "It ran but did not write answers.json."; return [false, "no answers.json"]; }
    return [true, `${((Date.now() - t) / 1000).toFixed(1)}s · $0.0000`];
  }, 600);
  if (!ran) continue;

  const ch = await streamed(checker, pc,
    `${task}\n\nHere is a program that claims to solve this:\n\`\`\`python\n${readFileSync(file, "utf8")}\n\`\`\`\n` +
      `Do NOT compute anything yourself. Review only whether the code implements every rule in the task ` +
      `(dedupe, badge resolution, rating validity, latest rating, Bayesian formula, storno/TEST, booking status and overlap). ` +
      `Reply "APPROVED" or "REJECTED: <rule> <what is wrong>" in at most two sentences.`,
    "checker reviews the code", `B:check:${round}`);
  approved = /^\s*APPROVED/i.test(ch.text);
  note(approved ? `${c.green}checker: APPROVED${c.reset}` : `${c.yellow}checker: ${ch.text.trim().replace(/\s+/g, " ").slice(0, 110)}${c.reset}`);
  if (!approved) feedback = ch.text;
  out("\n");
}

if (!existsSync("answers.json")) { out(`\n  ${c.red}No answers.json produced. Try again or ask your neighbour.${c.reset}\n`); process.exit(1); }
out("\n");
step("Checking against the real numbers");
const results = check(JSON.parse(readFileSync("answers.json", "utf8")));
await revealChecks(results);
scoreBox({ score: results.filter((r) => r.ok).length, cost: spent, seconds: (Date.now() - t0) / 1000, round: "B" });

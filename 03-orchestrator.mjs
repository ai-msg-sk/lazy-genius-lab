// Round B without an IDE agent (key B). The Lazy Genius loop, test-driven:
//   writer model  -> writes a Python program        (cheap, creative)
//   your laptop   -> runs it on the full 150k rows   (deterministic, free)
//   tests         -> verify.mjs logic: right/wrong per question (the tests decide, not a reviewer)
//   checker model -> only if a test fails: finds the bug for the failing rules (different vendor)
// Usage: node 03-orchestrator.mjs [writer] [checker]
// Generated code runs on your laptop. Read it (my-work/round-b/) before you trust it.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { ANSWERS, ROUND_B, ensureWork, rel } from "./lib/paths.mjs";
import { askStream, priceOf } from "./lib/or.mjs";
import { check, QUESTIONS } from "./lib/check.mjs";
import {
  brandLine, banner, step, note, thinkPanel, region, frame, panelWidth, revealChecks, scoreBox, nextBox, cmd, showJson,
  spin, wave, mark, c, isTTY, out,
} from "./lib/tui.mjs";
import { carouselPanel, writerScenes, checkerScenes } from "./lib/carousel.mjs";

const run = promisify(execFile);
const writer = process.argv[2] ?? "anthropic/claude-haiku-5.5";
const checker = process.argv[3] ?? "openai/gpt-6-luna-pro";
const task = readFileSync(new URL("./TASK.md", import.meta.url), "utf8");
const preview = readFileSync(new URL("./data/preview.txt", import.meta.url), "utf8");
const MAX = 4;
ensureWork();
const short = (m) => m.split("/").pop();
// Pull the Python out of the reply: a fenced block (closed or not, \n or \r\n), else the whole reply minus stray fences.
const code = (s) => {
  const t = s.replace(/\r\n/g, "\n");
  const m = t.match(/```[a-zA-Z0-9_-]*[ \t]*\n([\s\S]*?)(?:\n```|$)/);
  return (m ? m[1] : t).replace(/^```.*$/gm, "").trim() + "\n";
};

await brandLine("Round B");
await banner("ROUND B", "let the AI write code · key B");
note(`writer ${c.violet}${writer}${c.grey} · runtime ${c.violet}your laptop${c.grey} · tests ${c.violet}verify${c.reset}`);
note(`checker ${c.violet}${checker}${c.grey} (only if a test fails)${c.reset}`);
out("\n");

// Python 3 only. Windows: the py launcher first; the Store alias stub is not Python.
const PY = await (async () => {
  const cands = process.platform === "win32" ? [["py", ["-3"]], ["python", []], ["python3", []]] : [["python3", []], ["python", []]];
  for (const [bin, pre] of cands) {
    try {
      const r = await run(bin, [...pre, "--version"], { timeout: 10_000 });
      if (/Python 3\./.test(r.stdout + r.stderr)) return [bin, pre];
    } catch {}
  }
  return null;
})();
if (!PY) {
  out(`  ${c.red}${c.bold}✗ Python 3 not found.${c.reset} ${c.grey}Windows: winget install Python.Python.3.13, then open a NEW terminal. Or use Claude Code.${c.reset}\n\n`);
  process.exit(1);
}

const [pw, pc] = await Promise.all([priceOf(writer), priceOf(checker)]);
const questionLines = task.split("\n").filter((l) => /^\*\*q[1-5]\*\*/.test(l)).map((l) => l.replace(/\*\*/g, ""));
let spent = 0, feedback = "";
const t0 = Date.now();

// One streamed model call inside the live panel; returns the askStream result.
async function streamed(model, price, prompt, tag, panelOpts) {
  let chars = 0;
  const inTok = Math.round(prompt.length / 3.6);
  const p = carouselPanel({ model, rows: 8, stats: () => ({ tok: chars / 3.6, cost: inTok * price.in + (chars / 3.6) * price.out }), ...panelOpts });
  const tS = Date.now();
  const r = await askStream(model, prompt, {
    tag, maxTokens: 16000,
    onReasoning: (t) => { chars += t.length; p.reason(t); },
    onText: (t) => { chars += t.length; p.write(t); },
  });
  spent += r.cost;
  r.secs = (Date.now() - tS) / 1000;
  p.stop(r.ok ? panelOpts.summary(r) : `    ${c.red}✗ ${short(model)}: ${r.error}${c.reset}`);
  return r;
}

// Run the generated program, streaming its output into a panel.
function runPanel(file) {
  return new Promise((resolve) => {
    const tS = Date.now();
    const lines = [];
    let buf = "", err = "";
    const child = spawn(PY[0], [...PY[1], file], { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
    const killer = setTimeout(() => child.kill(), 120_000);
    const take = (d, isErr) => {
      const s = d.toString("utf8");
      if (isErr) err += s;
      buf += s;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop();
      for (const l of parts) lines.push({ l, isErr });
    };
    child.stdout.on("data", (d) => take(d, false));
    child.stderr.on("data", (d) => take(d, true));
    const name = file.split("/").pop();
    const secs = () => ((Date.now() - tS) / 1000).toFixed(1);
    const reg = isTTY ? region() : null;
    let f = 0;
    const draw = (final) => {
      f++;
      const body = lines.length
        ? lines.slice(-6).map(({ l, isErr }) => (isErr || final === "crash" ? `${c.red}${l}${c.reset}` : `${c.white}${l}${c.reset}`))
        : [`${c.pink}${spin(f)}${c.reset} ${c.grey}running, no output yet · ${secs()}s${c.reset}`];
      while (body.length < 6) body.unshift("");
      const title = `${c.pink}◆${c.reset} ${c.white}${c.bold}your laptop${c.reset} runs ${c.white}${name}${c.reset} on 150,000 rows ${c.grey}· ${secs()}s · $0.0000${c.reset}`;
      reg.draw(frame(body, { width: panelWidth(), title, foot: `${c.violet}${wave(f, 0.5)}${c.reset}` }));
    };
    const id = isTTY ? setInterval(draw, 80) : null;
    if (isTTY) draw();
    child.on("error", (e) => { err += String(e.message); });
    child.on("close", (codeNum, signal) => {
      clearTimeout(killer);
      if (buf) lines.push({ l: buf, isErr: false });
      if (isTTY) { clearInterval(id); reg.clear(); }
      resolve({ ok: codeNum === 0 && !signal, code: codeNum, signal, stderr: err, lines, secs: (Date.now() - tS) / 1000 });
    });
  });
}

let results = null, score = 0;
for (let round = 1; round <= MAX; round++) {
  step(`Attempt ${round} of ${MAX}`);
  const file = rel(path.join(ROUND_B, `solve-r${round}.py`));
  const w = await streamed(writer, pw,
    `${task}\n\nFirst rows of each sheet (tab-separated):\n${preview}\n\n` +
      `Write ONE Python 3 program using only the standard library (zipfile, re, xml, json, collections, datetime). ` +
      `It reads data/openslava-2026-export.xlsx (inline strings: <c t="inlineStr"><is><t>, numbers: <v>), ` +
      `computes the five answers exactly as specified and writes my-work/answers.json. Use integer cents for money. ` +
      `TASK.md has an "Edge cases" section listing every trap present in the data: handle each one. ` +
      `Your program is judged by tests (the verify step), not by a reviewer.` +
      (feedback ? `\n\nYour previous attempt failed:\n${feedback}` : "") +
      `\nReply with a single \`\`\`python code block only. Keep any thinking short.`,
    `B:write:${round}`,
    {
      code: file.split("/").pop(), feed: questionLines, feedTitle: "thinking…", thinkTitle: "is thinking",
      scenes: writerScenes({ task, questions: questionLines }),
      summary: (r) => `    ${c.green}✓${c.reset} ${short(writer)} wrote ${code(r.text).split("\n").length} lines in ${r.secs.toFixed(1)}s ${c.grey}· $${r.cost.toFixed(4)} · ${file}${c.reset}`,
    });
  if (!w.ok) break;
  if (!w.text.trim()) { feedback = "You returned no code. Think less, write the program."; note(`${c.yellow}no code returned, asking again${c.reset}`); out("\n"); continue; }
  writeFileSync(file, code(w.text));
  rmSync(ANSWERS, { force: true });

  // 2. run it
  const ran = await runPanel(file);
  if (!ran.ok) {
    const tb = (ran.stderr || ran.lines.map((x) => x.l).join("\n") || `exit ${ran.code ?? ran.signal}`).trim().split("\n").slice(-6);
    out(`    ${c.red}✗ crashed after ${ran.secs.toFixed(1)}s${c.reset}\n`);
    for (const l of tb) out(`      ${c.red}${l}${c.reset}\n`);
    out(`    ${c.grey}→ sending the error back to the writer${c.reset}\n\n`);
    feedback = `It crashed:\n${String(ran.stderr || ran.signal || "").slice(-1500)}`;
    continue;
  }
  if (!existsSync(ANSWERS)) {
    out(`    ${c.red}✗ ran in ${ran.secs.toFixed(1)}s but wrote no answers.json${c.reset}\n    ${c.grey}→ telling the writer${c.reset}\n\n`);
    feedback = "It ran but did not write answers.json.";
    continue;
  }
  out(`    ${c.green}✓${c.reset} ran in ${ran.secs.toFixed(1)}s on your laptop ${c.grey}· $0.0000${ran.lines.length ? ` · ${ran.lines.length} lines of output` : ""}${c.reset}\n`);

  // 3. test first
  let answers;
  try { answers = JSON.parse(readFileSync(ANSWERS, "utf8")); }
  catch { out(`    ${c.red}✗ answers.json is not valid JSON${c.reset}\n\n`); feedback = "answers.json is not valid JSON."; continue; }
  results = check(answers);
  score = results.filter((r) => r.ok).length;
  const failing = results.filter((r) => !r.ok);
  if (!failing.length) { out(`    ${c.green}✓${c.reset} ${c.green}${c.bold}tests pass 5/5${c.reset} ${c.grey}· no review needed${c.reset}\n\n`); break; }
  out(`    ${mark(false)} tests ${c.yellow}${c.bold}${score}/5${c.reset}  ${failing.map((r) => `${c.red}✗ ${r.key.slice(0, 2)}${c.reset}`).join("  ")} ${c.grey}(${failing.map((r) => r.label).join(", ")})${c.reset}\n`);
  if (round === MAX) { out("\n"); break; }

  // 4. checker: find the bug for the failing rules only
  const wrong = failing.map((r) => `${r.key.slice(0, 2)} ${QUESTIONS[r.key]}`).join(", ");
  const src = readFileSync(file, "utf8");
  const ch = await streamed(checker, pc,
    `${task}\n\nHere is a program that tries to solve this:\n\`\`\`python\n${src}\n\`\`\`\n` +
      `These answers are wrong: ${wrong}. Do NOT compute anything yourself. ` +
      `Find the bug in the code for those rules only. Reply with the rule and the line, in at most three sentences.`,
    `B:check:${round}`,
    {
      feed: src.split("\n").filter((l) => l.trim()), feedTitle: "reading the code…", writeTitle: "writing the verdict…",
      scenes: checkerScenes({ codeLines: src.split("\n").filter((l) => l.trim()), wrong }),
      summary: (r) => `    ${c.green}✓${c.reset} ${short(checker)} reviewed ${wrong} in ${r.secs.toFixed(1)}s ${c.grey}· $${r.cost.toFixed(4)}${c.reset}`,
    });
  const verdict = (ch.text || "").trim().replace(/\s+/g, " ");
  out(`    ${c.warnBadge} BUG REPORT ${c.reset} ${c.yellow}${verdict.slice(0, 220) || "(no answer)"}${c.reset}\n`);
  out(`    ${c.grey}→ sending ${wrong} and the bug report to the writer${c.reset}\n\n`);
  feedback = `The tests say these answers are wrong: ${wrong}. (The others are right; keep them.)\nA reviewer found:\n${ch.text || "(no review)"}`;
}

// After the last attempt: always the reveal, the score and what to do next.
const secs = (Date.now() - t0) / 1000;
if (!existsSync(ANSWERS) || !results) {
  out(`\n  ${c.red}No answers.json produced.${c.reset}\n`);
  scoreBox({ score: 0, cost: spent, seconds: secs, round: "B" });
  nextBox([`Not there yet: try again  ${cmd("node 03-orchestrator.mjs")}`, `${c.grey}or use Claude Code:${c.reset}  ${cmd("claude")}`]);
  process.exit(1);
}
step("my-work/answers.json");
showJson(JSON.parse(readFileSync(ANSWERS, "utf8")));
out("\n");
step("Checking against the real numbers");
results = check(JSON.parse(readFileSync(ANSWERS, "utf8")));
score = results.filter((r) => r.ok).length;
await revealChecks(results);
scoreBox({ score, cost: spent, seconds: secs, round: "B" });
if (score === 5 && process.env.LAB_NO_FINALE) {
  out(`  ${c.green}${c.bold}5/5.${c.reset} ${c.grey}Your results come next.${c.reset}\n`);
} else if (score === 5) {
  // 5/5: straight into the finale (A vs B, badge, bonus, feedback QR), same as verify.mjs
  const { spawnSync } = await import("node:child_process");
  spawnSync(process.execPath, [new URL("./compare.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { stdio: "inherit" });
} else nextBox([
  `Not there yet: ask the AI to fix the ✗ questions, then  ${cmd("node verify.mjs")}`,
  `Or retry the loop:  ${cmd("node 03-orchestrator.mjs")}`,
]);
process.exitCode = score === 5 ? 0 : 1; // lab.mjs ticks Round B only at 5/5

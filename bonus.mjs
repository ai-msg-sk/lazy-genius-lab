// Bonus: the organizers found a SECOND export (late sync). Same format, different numbers.
// Your Round B program runs on it unchanged, with no AI at all. That's the point of writing code.
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { ROOT, WORK, rel } from "./lib/paths.mjs";
import { check, bonusHashes } from "./lib/check.mjs";
import { loadResults } from "./lib/results.mjs";
import { brandLine, step, note, live, revealChecks, box, nextBox, cmd, c, spin, isTTY } from "./lib/tui.mjs";

const run = promisify(execFile);
const out = (s) => process.stdout.write(s);
await brandLine("bonus · the second export");

// 1. find the newest Python program the attendee (or their agent) wrote
const pys = [];
const walk = (d, depth = 0) => { for (const n of readdirSync(d)) { if (n.startsWith(".") || n === "node_modules" || n === "data") continue; const p = path.join(d, n); const st = statSync(p); if (st.isDirectory() && depth < 3) walk(p, depth + 1); else if (n.endsWith(".py")) pys.push([p, st.mtimeMs]); } };
walk(ROOT);
const script = pys.sort((a, b) => b[1] - a[1])[0]?.[0];
if (!script) {
  nextBox([`No Python program found yet. Finish Round B first:  ${cmd("claude")}  or  ${cmd("node 03-orchestrator.mjs")}`]);
  process.exit(1);
}

out(`\n  ${c.white}${c.bold}9:40, a message from the organizers:${c.reset} ${c.grey}"Sorry, the first export missed a late sync.${c.reset}\n  ${c.grey}Here's the new one. Same format, all numbers changed. Sponsors still call at 10:00."${c.reset}\n\n`);
// What changed between the two exports (precomputed by admin/bonus-diff.cjs)
step("What changed in the export");
const diff = JSON.parse(readFileSync(path.join(ROOT, "data", "bonus", "diff.json"), "utf8"));
for (const d of diff) {
  const delta = d.newRows - d.oldRows;
  out(`    ${c.white}${d.sheet.padEnd(16)}${c.reset} ${c.grey}${d.oldRows.toLocaleString("en").padStart(6)} → ${c.reset}${c.white}${d.newRows.toLocaleString("en").padStart(6)} rows${c.reset} ${delta ? `${delta > 0 ? c.green : c.red}${((delta > 0 ? "+" : "") + delta).padStart(5)}${c.reset}` : "     "}  ${c.yellow}${String(d.pct).padStart(3)} % of rows changed${c.reset}\n`);
  if (isTTY) await new Promise((r) => setTimeout(r, 120));
}
const ex = diff.find((d) => d.sheet === "Catering")?.example ?? diff.find((d) => d.example)?.example;
if (ex) {
  out(`\n    ${c.grey}e.g. Catering, row ${ex.row}:${c.reset}\n`);
  out(`    ${c.red}- ${ex.old}${c.reset}\n`);
  out(`    ${c.green}+ ${ex.new}${c.reset}\n`);
}
out("\n");
// the attendee's Round B answers, to show old → new after the run
let before = null;
try { before = JSON.parse(readFileSync(path.join(WORK, "answers.json"), "utf8")); } catch {}

step(`Your program from Round B · ${c.violet}${rel(script)}${c.reset}`);
note("runs on the NEW export, unchanged. No AI, no tokens, no prompt.");

// 2. run it in a scratch copy of the lab where data/ holds the new export
const dir = path.join(tmpdir(), `lazy-genius-bonus-${process.pid}`);
mkdirSync(path.join(dir, "data"), { recursive: true });
mkdirSync(path.join(dir, "my-work", "round-b"), { recursive: true });
copyFileSync(path.join(ROOT, "data", "bonus", "openslava-2026-export.xlsx"), path.join(dir, "data", "openslava-2026-export.xlsx"));
for (const f of ["TASK.md"]) copyFileSync(path.join(ROOT, f), path.join(dir, f));
const PY = await (async () => { for (const [cmd0, pre] of process.platform === "win32" ? [["py", ["-3"]], ["python", []], ["python3", []]] : [["python3", []], ["python", []]]) { try { const r = await run(cmd0, [...pre, "--version"], { timeout: 10_000 }); if (/Python 3\./.test(r.stdout + r.stderr)) return [cmd0, pre]; } catch {} } return null; })();
if (!PY) { nextBox([`Python 3 not found. Windows: winget install Python.Python.3.13, then open a new terminal.`]); process.exit(1); }

const t0 = Date.now();
const ticker = live((f) => `    ${c.pink}${spin(f)}${c.reset} ${c.white}your laptop crunches 150,000 new rows${c.reset} ${c.grey}${((Date.now() - t0) / 1000).toFixed(1)} s${c.reset}  ${c.yellow}${c.bold}AI cost $0.0000${c.reset}`);
let err = null;
try { await run(PY[0], [...PY[1], script], { cwd: dir, timeout: 180_000, maxBuffer: 16 << 20, env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } }); }
catch (e) { err = String(e.stderr || e.message).trim().split("\n").slice(-4).join("\n      "); }
const secs = (Date.now() - t0) / 1000;
const found = [path.join(dir, "my-work", "answers.json"), path.join(dir, "answers.json")].find((p) => existsSync(p));
ticker.stop(err ? `    ${c.red}✗ it crashed after ${secs.toFixed(1)} s${c.reset}\n      ${c.grey}${err}${c.reset}` : `    ${c.green}✓${c.reset} ran in ${c.white}${c.bold}${secs.toFixed(1)} s${c.reset} ${c.grey}· AI cost $0.0000 · 0 tokens${c.reset}`);

let results = null;
if (found) { try { results = check(JSON.parse(readFileSync(found, "utf8")), bonusHashes()); } catch {} }
rmSync(dir, { recursive: true, force: true });
if (!results) {
  nextBox([`Your program didn't produce answers on the new export${err ? " (see the error above)" : ""}.`, `That happens: ask your agent to make it robust, then  ${cmd("node bonus.mjs")}`]);
  process.exit(1);
}

out("\n");
step("Checking against the NEW real numbers");
await revealChecks(results);
if (before) {
  out(`\n    ${c.grey}your answers, first export → second export${c.reset}\n`);
  for (const r of results) {
    const o = JSON.stringify(before[r.key] ?? "–"), n = JSON.stringify(r.value ?? "–");
    out(`    ${c.grey}${r.key.slice(0, 2)}${c.reset}  ${r.label.padEnd(24)} ${c.grey}${o.padStart(12)}${c.reset} → ${o === n ? c.white : c.yellow}${c.bold}${n}${c.reset}${o === n ? `  ${c.grey}(same)${c.reset}` : ""}\n`);
  }
}
const score = results.filter((r) => r.ok).length;
const { A } = await loadResults().catch(() => ({ A: { cost: 0.15 } }));
box([
  `${c.grey}SCORE${c.reset}  ${score === 5 ? c.green : c.yellow}${c.bold}${score}/5${c.reset} ${c.grey}on data it has never seen${c.reset}`,
  ``,
  `${c.white}This answer cost${c.reset}   ${c.green}${c.bold}$0.0000${c.reset}  ${c.grey}· ${secs.toFixed(1)} s · reused code${c.reset}`,
  `${c.white}Round A again${c.reset}      ${c.pink}${c.bold}~$${A.cost.toFixed(3)}${c.reset}  ${c.grey}· another minute · another guess${c.reset}`,
], score === 5 ? c.green : c.yellow, `${c.bold}BONUS${c.reset}`);
out(`  ${c.bold}Code is an asset. A chat answer is a one-off.${c.reset}\n`);
nextBox([
  score === 5 ? `Tell the room: ${c.bold}your code survived the second export.${c.reset}` : `Not 5/5: the new data has different edge cases. Ask your agent to fix it, then  ${cmd("node bonus.mjs")}`,
  ``,
  `When we're done:  ${cmd("node cleanup.mjs")}  ${c.grey}(your work in my-work/ stays)${c.reset}`,
]);

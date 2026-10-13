// One command for the whole lab. Shows where you are, Enter runs the next step, and it remembers
// your progress (my-work/progress.json), so you can close it and come back.
// Usage: node lab.mjs            (↑ ↓ choose, Enter start, 1–8 jump, q quit)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import path from "node:path";
import { ROOT, WORK, findAnswers } from "./lib/paths.mjs";
import { check } from "./lib/check.mjs";
import { ROUND_B_PROMPT, copyToClipboard } from "./lib/clipboard.mjs";
import { brandLine, step, box, cmd, c, isTTY, out } from "./lib/tui.mjs";

const PROGRESS = path.join(WORK, "progress.json");
const load = () => { try { return JSON.parse(readFileSync(PROGRESS, "utf8")); } catch { return { done: [] }; } };
const save = (p) => { mkdirSync(WORK, { recursive: true }); writeFileSync(PROGRESS, JSON.stringify(p, null, 1) + "\n"); };
const node = (file, args = [], env = {}) => spawnSync(process.execPath, [path.join(ROOT, file), ...args], { stdio: "inherit", cwd: ROOT, env: { ...process.env, ...env } }).status ?? 1;
const score = () => { try { return check(JSON.parse(readFileSync(findAnswers(), "utf8"))).filter((r) => r.ok).length; } catch { return null; } };

const STEPS = [
  { id: "start", title: "Unlock your keys", time: "2 min", why: "type the claim code from your sheet", run: () => node("start.mjs"), done: () => existsSync(path.join(ROOT, ".env")) },
  { id: "excel", title: "Look at the data", time: "5 min", why: "open the Excel and spot 5 traps yourself", run: () => node("excel.mjs") },
  { id: "task", title: "Read the task", time: "2 min", why: "the five numbers the organizers need", run: () => node("task.mjs") },
  { id: "roundA", title: "Round A · let the AI guess", time: "15 min", why: "paste the Excel into an AI (key A)", run: () => node("02-paste-into-chat.mjs") },
  { id: "roundB", title: "Round B · let the AI write code", time: "30 min", why: "the AI writes a program, your laptop runs it (key B)", run: roundB, done: () => score() === 5 },
  { id: "results", title: "Your results", time: "3 min", why: "A vs B, your certificate, the feedback QR", run: () => node("verify.mjs") },
  { id: "bonus", title: "Bonus · the second export", time: "2 min", why: "does your code survive new data? ($0)", run: () => node("bonus.mjs") },
  { id: "cleanup", title: "Clean up", time: "1 min", why: "delete your keys; your work stays", run: () => node("cleanup.mjs") },
];

async function roundB() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  out(`\n  ${c.white}${c.bold}Round B: who writes the code?${c.reset}\n`);
  out(`    ${c.pink}1${c.reset}  Claude Code ${c.grey}(recommended: you talk to the agent, it writes and runs the program)${c.reset}\n`);
  out(`    ${c.pink}2${c.reset}  The orchestrator ${c.grey}(no agent needed: watch a cheap model write, your laptop run, a test check)${c.reset}\n`);
  const a = (await rl.question(`  ${c.pink}▸${c.reset} 1 or 2 ${c.grey}[1]${c.reset}: `).catch(() => "")).trim();
  rl.close();
  if (a === "2") return node("03-orchestrator.mjs", [], { LAB_NO_FINALE: "1" }); // results are step 6
  const copied = copyToClipboard(ROUND_B_PROMPT);
  box([
    `${c.bold}Claude Code is starting.${c.reset}`,
    ``,
    copied ? `1  Paste the prompt (Cmd+V / Ctrl+V), it's in your clipboard:` : `1  Type this prompt:`,
    `   ${c.violet}${ROUND_B_PROMPT}${c.reset}`,
    `2  Let it work until ${c.bold}node verify.mjs${c.reset} says ${c.green}${c.bold}5/5${c.reset}.`,
    `3  Type ${c.white}${c.bold}/exit${c.reset} to come back here. Your progress is saved.`,
  ], c.pink, `${c.bold}ROUND B${c.reset}`);
  const r = spawnSync("claude", [], { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" });
  if (r.error) {
    out(`\n  ${c.yellow}Claude Code isn't installed here, so the orchestrator runs instead.${c.reset}\n`);
    return node("03-orchestrator.mjs", [], { LAB_NO_FINALE: "1" });
  }
  return 0;
}

const p = load();
const isDone = (s) => p.done.includes(s.id) || (s.done?.() ?? false);

function journey() {
  const next = STEPS.findIndex((s) => !isDone(s));
  out("\n");
  step(`Your lab · ${next < 0 ? "all done" : `step ${next + 1} of ${STEPS.length}`}`);
  out(`    ${STEPS.map((s, i) => (isDone(s) ? `${c.green}●${c.reset}` : i === next ? `${c.pink}◉${c.reset}` : `${c.grey}○${c.reset}`)).join(" ")}\n\n`);
  STEPS.forEach((s, i) => {
    const mark = isDone(s) ? `${c.green}✓${c.reset}` : i === next ? `${c.pink}▸${c.reset}` : " ";
    const title = i === next ? `${c.white}${c.bold}${s.title}${c.reset}` : isDone(s) ? `${c.grey}${s.title}${c.reset}` : s.title;
    out(`   ${mark} ${c.grey}${i + 1}${c.reset}  ${title}${" ".repeat(Math.max(1, 34 - s.title.length))}${c.grey}${s.time.padStart(6)}  ${s.why}${c.reset}\n`);
  });
  return next;
}

if (!isTTY || !process.stdin.isTTY) {
  journey();
  out(`\n  Run the steps one by one, e.g. ${cmd("node start.mjs")}\n`);
  process.exit(0);
}

const CLEAR = "\x1b[2J\x1b[3J\x1b[H"; // clear screen + scrollback, cursor home: every view starts at the top
const pause = async (msg) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  out("\x1b[?25h");
  await rl.question(`\n  ${c.pink}▸${c.reset} ${c.bold}Enter${c.reset} ${c.grey}${msg}${c.reset} `).catch(() => "");
  rl.close();
};

// The menu: big card for the selected step, the list below, arrow keys to move.
const vis = (x) => x.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
function render(sel) {
  const next = STEPS.findIndex((x) => !isDone(x));
  const s = STEPS[sel], W = Math.min((process.stdout.columns || 80) - 6, 72);
  const line = (txt = "") => `  ${c.pink}│${c.reset}  ${txt}${" ".repeat(Math.max(0, W - 4 - vis(txt)))}${c.pink}│${c.reset}`;
  const head = ` STEP ${sel + 1} OF ${STEPS.length}${isDone(s) ? " · DONE" : sel === next ? " · NEXT" : ""} `;
  const o = [
    "",
    `  ${c.rasp}●${c.reset}${c.bold}msg${c.reset}  ${c.grey}×${c.reset}  ${c.white}${c.bold}OPEN${c.reset}${c.white}SLAVA${c.reset} ${c.grey}'26  ·  the lazy genius lab${c.reset}`,
    "",
    `  ${STEPS.map((x, i) => (isDone(x) ? `${c.green}●${c.reset}` : i === next ? `${c.pink}◉${c.reset}` : `${c.grey}○${c.reset}`)).join(" ")}   ${c.grey}${next < 0 ? "all done" : `${STEPS.filter(isDone).length} of ${STEPS.length} done`}${c.reset}`,
    "",
    `  ${c.pink}╭─${c.reset}${c.bold}${head}${c.reset}${c.pink}${"─".repeat(Math.max(1, W - 3 - head.length))}╮${c.reset}`,
    line(),
    line(`${c.white}${c.bold}${s.title.toUpperCase()}${c.reset}${" ".repeat(Math.max(2, W - 14 - s.title.length))}${c.grey}${s.time}${c.reset}`),
    line(`${c.grey}${s.why}${c.reset}`),
    line(),
    `  ${c.pink}╰${"─".repeat(W - 2)}╯${c.reset}`,
    "",
    ...STEPS.map((x, i) => {
      const here = i === sel;
      const mark = isDone(x) ? `${c.green}✓${c.reset}` : i === next ? `${c.pink}◉${c.reset}` : `${c.grey}○${c.reset}`;
      const t = here ? `${c.white}${c.bold}${x.title}${c.reset}` : isDone(x) ? `${c.grey}${x.title}${c.reset}` : x.title;
      return `  ${here ? `${c.pink}${c.bold}▶${c.reset}` : " "} ${mark}  ${c.grey}${i + 1}${c.reset}  ${t}`;
    }),
    "",
    `     ${c.white}${c.bold}↑ ↓${c.reset} ${c.grey}choose${c.reset}        ${c.white}${c.bold}Enter${c.reset} ${c.grey}start${c.reset}        ${c.white}${c.bold}q${c.reset} ${c.grey}quit${c.reset}        ${c.grey}progress is saved${c.reset}`,
  ];
  out(CLEAR + o.join("\n") + "\n");
}
async function choose(start) {
  let sel = Math.max(0, start);
  render(sel);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  out("\x1b[?25l");
  return await new Promise((resolve) => {
    const done = (v) => { process.stdin.off("keypress", onKey); process.stdin.setRawMode(false); process.stdin.pause(); resolve(v); };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === "c") return done(-1);
      if (key.name === "up" || key.name === "k") { sel = (sel + STEPS.length - 1) % STEPS.length; render(sel); }
      else if (key.name === "down" || key.name === "j" || key.name === "tab") { sel = (sel + 1) % STEPS.length; render(sel); }
      else if (key.name === "return" || key.name === "enter" || key.name === "space") done(sel);
      else if (key.name === "q" || key.name === "escape") done(-1);
      else if (/^[1-8]$/.test(str ?? "")) { sel = Number(str) - 1; render(sel); }
    };
    process.stdin.on("keypress", onKey);
  });
}

for (;;) {
  const next = STEPS.findIndex((x) => !isDone(x));
  const i = await choose(next < 0 ? STEPS.length - 1 : next);
  if (i < 0) { out(CLEAR + `\n  ${c.grey}Progress saved. Continue any time:${c.reset} ${cmd("node lab.mjs")}\n\n\x1b[?25h`); break; }
  const s = STEPS[i];
  out(CLEAR + `  ${c.pink}━━ step ${i + 1} of ${STEPS.length} · ${s.title} ━━${c.reset}\n\x1b[?25h`);
  const status = await s.run();
  if (status === 0 && !p.done.includes(s.id)) { p.done.push(s.id); save(p); }
  if (s.id === "cleanup" && !existsSync(ROOT)) break; // the whole folder was deleted
  // let them read what the step printed before the menu replaces it
  const after = STEPS.findIndex((x) => !isDone(x));
  await pause(after < 0 ? "= back to your lab" : `= back to your lab · next: ${STEPS[after].title}`);
}

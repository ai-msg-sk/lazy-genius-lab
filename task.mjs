// Shows the assignment on ONE screen (story, five questions, top traps) and opens the full TASK.md in an editor.
// Usage: node task.mjs            (summary + open TASK.md)
//        node task.mjs --full     (print the whole TASK.md here)
//        node task.mjs --no-open  (don't open the editor)
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { brandLine, nextBox, cmd, c, isTTY } from "./lib/tui.mjs";

const file = new URL("./TASK.md", import.meta.url);
const md = readFileSync(file, "utf8");
const out = (s) => process.stdout.write(s);

// Tiny markdown → terminal: headings, **bold**, `code`, tables, code fences.
const inline = (s) => s
  .replace(/\*\*([^*]+)\*\*/g, `${c.bold}${c.white}$1${c.reset}`)
  .replace(/`([^`]+)`/g, `${c.violet}$1${c.reset}`);
await brandLine("the assignment");
if (!process.argv.includes("--full")) {
  out(`
  ${c.white}${c.bold}9:00, the morning after OpenSlava.${c.reset} ${c.grey}The sponsors call at 10:00 and want five numbers.${c.reset}
  ${c.grey}All you have:${c.reset} ${c.violet}data/openslava-2026-export.xlsx${c.reset} ${c.grey}· 6 sheets · 150,000 messy rows${c.reset}

  ${c.pink}1${c.reset}  How many ${c.bold}different people${c.reset} registered?            ${c.grey}a person = one e-mail${c.reset}
  ${c.pink}2${c.reset}  How many of them ${c.bold}actually came${c.reset}?                  ${c.grey}at least one badge scan${c.reset}
  ${c.pink}3${c.reset}  Which talk ${c.bold}won the audience award${c.reset}?               ${c.grey}fair score, fake votes removed${c.reset}
  ${c.pink}4${c.reset}  ${c.bold}Catering revenue${c.reset} on 14 Oct (EUR)?                ${c.grey}cancellations count, tests don't${c.reset}
  ${c.pink}5${c.reset}  How many ${c.bold}double-booked rooms${c.reset}?                    ${c.grey}confirmed bookings that overlap${c.reset}

  ${c.yellow}Watch out:${c.reset} the same person registered twice · ratings like ★★★★☆ · rooms written "Tatry" and "tatry ".
  ${c.grey}The exact rules (21 traps) are in${c.reset} ${c.white}TASK.md${c.reset}${c.grey}. Your AI will read them; you can skim them.${c.reset}
  ${c.grey}Answers go to${c.reset} ${c.violet}my-work/answers.json${c.reset}${c.grey}; ${c.reset}${c.violet}node verify.mjs${c.reset} ${c.grey}tells you right or wrong per number.${c.reset}
`);
}
let fence = false;
for (const raw of process.argv.includes("--full") ? md.split("\n") : []) {
  const line = raw.replace(/\r$/, "");
  if (line.startsWith("```")) { fence = !fence; continue; }
  if (fence) { out(`    ${c.grey}${line}${c.reset}\n`); continue; }
  if (/^# /.test(line)) out(`\n  ${c.pink}${c.bold}${line.slice(2).toUpperCase()}${c.reset}\n`);
  else if (/^## /.test(line)) out(`\n  ${c.pink}${c.bold}▸ ${line.slice(3)}${c.reset}\n`);
  else if (/^\|[-| ]+\|$/.test(line)) continue;
  else if (line.startsWith("|")) {
    const cells = line.split("|").slice(1, -1).map((x) => x.trim());
    out(`    ${cells.map((x, i) => inline(i === 0 ? x.padEnd(16) : x)).join(`${c.grey}  ·  ${c.reset}`)}\n`);
  } else out(line ? `  ${inline(line)}\n` : "\n");
}

if (!process.argv.includes("--no-open")) {
  // TextEdit on macOS, Notepad on Windows, the default app on Linux.
  const p = decodeURIComponent(file.pathname).replace(/^\/([A-Za-z]:)/, "$1");
  const [bin, args] = process.platform === "darwin" ? ["open", ["-e", p]]
    : process.platform === "win32" ? ["notepad", [p]]
    : ["xdg-open", [p]];
  try { spawn(bin, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref(); } catch {}
  if (isTTY) out(`  ${c.green}✓${c.reset} ${c.grey}Opened the full TASK.md in your text editor.${c.reset}\n`);
}

nextBox([`Round A, let the AI guess:  ${cmd("node 02-paste-into-chat.mjs")}`, `${c.grey}Haven't looked at the data yet?${c.reset}  ${cmd("node excel.mjs")}`]);

// Shows the assignment: prints TASK.md nicely in the terminal and opens it in a text editor.
// Usage: node task.mjs            (print + open)
//        node task.mjs --no-open  (print only)
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
brandLine("the assignment");
let fence = false;
for (const raw of md.split("\n")) {
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
  if (isTTY) out(`\n  ${c.grey}Also opened TASK.md in your text editor.${c.reset}\n`);
}

nextBox([`Round A, let the AI guess:  ${cmd("node 02-paste-into-chat.mjs")}`]);

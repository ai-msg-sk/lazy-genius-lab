// Look at the data before you ask anyone (or anything) about it.
// A 5-minute "spot the traps" hunt. Opens the Excel only if you ask (o), or peeks at it here (p).
// Usage: node excel.mjs
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { brandLine, step, nextBox, cmd, c, isTTY, out } from "./lib/tui.mjs";

const XLSX = path.join(ROOT, "data", "openslava-2026-export.xlsx");
const hunt = JSON.parse(readFileSync(path.join(ROOT, "data", "hunt.json"), "utf8"));
await brandLine("look at the data first");

// Open the Excel only when asked: in your spreadsheet app, or a quick peek right here.
function openXlsx() {
  const [bin, args] = process.platform === "darwin" ? ["open", [XLSX]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", XLSX]] : ["xdg-open", [XLSX]];
  try { spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref(); } catch {}
  out(`  ${c.green}✓${c.reset} ${c.grey}Opening data/openslava-2026-export.xlsx in your spreadsheet app…${c.reset}\n`);
}
function peek() {
  const W = Math.max(60, (process.stdout.columns || 100) - 6);
  const blocks = readFileSync(path.join(ROOT, "data", "preview.txt"), "utf8").split(/\n(?=### )/);
  for (const b of blocks) {
    const [head, ...rows] = b.trim().split("\n");
    out(`\n  ${c.pink}${c.bold}${head.replace(/^### /, "")}${c.reset}\n`);
    const cells = rows.filter((r) => r.includes("\t")).map((r) => r.split("\t"));
    const n = Math.max(...cells.map((r) => r.length));
    const width = Array.from({ length: n }, (_, i) => Math.min(22, Math.max(...cells.map((r) => (r[i] ?? "").length))));
    for (const [k, r] of cells.entries()) {
      let line = r.map((v, i) => (v ?? "").slice(0, width[i]).padEnd(width[i])).join(` ${c.grey}│${c.reset} `);
      out(`  ${k === 0 ? c.bold : ""}${line.slice(0, W + 40)}${c.reset}\n`);
    }
  }
}
if (isTTY && process.stdin.isTTY) {
  for (;;) {
    const rl0 = createInterface({ input: process.stdin, output: process.stdout });
    out("\x1b[?25h");
    const a = (await rl0.question(`\n  ${c.pink}▸${c.reset} ${c.white}${c.bold}o${c.reset} ${c.grey}open the Excel in your app${c.reset}   ${c.white}${c.bold}p${c.reset} ${c.grey}peek at the sheets here${c.reset}   ${c.white}${c.bold}Enter${c.reset} ${c.grey}start the hunt${c.reset}  `).catch(() => "")).trim().toLowerCase();
    rl0.close();
    if (a === "o") openXlsx();
    else if (a === "p") peek();
    else break;
  }
}

if (isTTY) out("\x1b[2J\x1b[3J\x1b[H"); // clean screen: the hunt starts at the top
out(`\n  ${c.white}${c.bold}Spot the traps.${c.reset} ${c.grey}5 things a human notices in seconds and a model has to guess from 3 % of the rows.${c.reset}\n`);
out(`  ${c.grey}Look in the sheet, then press${c.reset} ${c.white}y${c.reset} ${c.grey}if you found it or${c.reset} ${c.white}Enter${c.reset} ${c.grey}to be shown.${c.reset}\n\n`);

const traps = [
  { sheet: "Registrácie", task: "Find one person who registered twice.", hint: "Same e-mail, different case. Sort or search column C.",
    show: hunt.duplicate && `rows ${hunt.duplicate.rows.join(" and ")}: ${hunt.duplicate.as.join("  vs  ")}  → one person, not two` },
  { sheet: "Hodnotenia", task: "Find a rating that isn't a number.", hint: "Column C. Not every rating is 1–5.",
    show: `row ${hunt.star.row}: "${hunt.star.value}"  → that's a 4. Also 4/5, 4,0 and n/a exist.` },
  { sheet: "Catering", task: "Find a sale that was cancelled.", hint: "Column C starts with a word, column D is negative.",
    show: `row ${hunt.storno.row}: "${hunt.storno.item}", ${hunt.storno.qty} pcs  → it subtracts from revenue` },
  { sheet: "Catering", task: "Find a sale that isn't real.", hint: "Look at the stand (column B) in the first rows.",
    show: `row ${hunt.test.row}: stand "TEST"  → test transactions, exclude them` },
  { sheet: "Office planning", task: "Find one room written two ways.", hint: "Column C. Trailing spaces and lowercase count.",
    show: hunt.room && `rows ${hunt.room.rows.join(" and ")}: ${hunt.room.as.map((x) => JSON.stringify(x)).join("  vs  ")}  → the same room` },
];

let found = 0;
const dots = (i) => traps.map((_, k) => (k < i ? `${c.pink}●${c.reset}` : `${c.grey}○${c.reset}`)).join(" ");
const rl = isTTY && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
if (isTTY) out("\x1b[?25h");
for (let i = 0; i < traps.length; i++) {
  const t = traps[i];
  out(`  ${dots(i)}  ${c.white}${c.bold}${i + 1}. ${t.task}${c.reset}  ${c.violet}sheet ${t.sheet}${c.reset}\n`);
  out(`        ${c.grey}hint: ${t.hint}${c.reset}\n`);
  let a = "";
  if (rl) a = await rl.question(`        ${c.pink}▸${c.reset} found it? ${c.grey}[y / Enter = show me]${c.reset} `).catch(() => "");
  if (/^y/i.test(a.trim())) { found++; out(`        ${c.green}✓ nice.${c.reset} ${c.grey}${t.show ?? ""}${c.reset}\n\n`); }
  else out(`        ${c.yellow}→${c.reset} ${t.show ?? ""}\n\n`);
}
rl?.close();
if (isTTY) out("\x1b[?25l");

out(`  ${dots(traps.length)}  ${c.white}${c.bold}You spotted ${found} of 5.${c.reset} ${c.grey}Every one of them changes an answer. TASK.md lists 21 like these.${c.reset}\n`);
out(`  ${c.grey}A chat model gets about 3 % of these rows and has to guess the rest. Keep that in mind in Round A.${c.reset}\n`);

nextBox([
  `1  Read the task (2 min):  ${cmd("node task.mjs")}`,
  `2  Round A, let the AI guess:  ${cmd("node 02-paste-into-chat.mjs")}`,
]);

// Look at the data before you ask anyone (or anything) about it.
// Opens the Excel in your spreadsheet app and runs a 5-minute "spot the traps" hunt in the terminal.
// Usage: node excel.mjs            (open + hunt)
//        node excel.mjs --no-open  (hunt only)
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { brandLine, step, nextBox, cmd, c, isTTY, out } from "./lib/tui.mjs";

const XLSX = path.join(ROOT, "data", "openslava-2026-export.xlsx");
const hunt = JSON.parse(readFileSync(path.join(ROOT, "data", "hunt.json"), "utf8"));
await brandLine("look at the data first");

// 1. open it (Excel / Numbers / LibreOffice: whatever owns .xlsx)
if (!process.argv.includes("--no-open")) {
  const [bin, args] = process.platform === "darwin" ? ["open", [XLSX]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", XLSX]] : ["xdg-open", [XLSX]];
  try { spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref(); } catch {}
  out(`\n  ${c.green}✓${c.reset} Opened ${c.white}data/openslava-2026-export.xlsx${c.reset} ${c.grey}(no spreadsheet app? the hints below show the rows anyway)${c.reset}\n`);
}

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

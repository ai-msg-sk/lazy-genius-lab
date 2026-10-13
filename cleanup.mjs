// End of the lab: removes your KEYS (always) and proves none are left. Your work in my-work/ stays
// unless you type "delete" when asked (Enter or 20 s of silence = keep). Then the feedback QR.
// Usage: node cleanup.mjs          (keys only, asks about the rest)
//        node cleanup.mjs --all    (also deletes the whole lab folder, no question)
import { existsSync, rmSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { showQR } from "./lib/qr.mjs"; // static import: loaded before anything is deleted
import { ROOT } from "./lib/paths.mjs";
import { brandLine, banner, step, checkLine, box, c, isTTY } from "./lib/tui.mjs";

const out = (s) => process.stdout.write(s);
// Always the folder this script lives in, never the current directory: running it from ~ must not touch ~.
const here = path.resolve(ROOT); // resolve: no trailing slash (the history folder name depends on it)
// Safe to run again and again: whatever is already gone shows as "not there".
// The whole-folder delete only ever targets a folder that is clearly this lab.
const isLabFolder = (d) => ["lab.mjs", "TASK.md", "answers.hashes.json", "verify.mjs"].every((f) => existsSync(path.join(d, f)))
  && path.resolve(d) !== path.resolve(homedir()) && path.dirname(path.resolve(d)) !== path.resolve(d);
await brandLine("cleanup");
await banner("BYE", "cleaning up after the lazy genius lab");

// Claude Code keeps per-folder history here; it may contain what the agent read in this folder.
const projRoot = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"), "projects");
const slug = here.replace(/[^A-Za-z0-9]/g, "-");
const ccHistory = (() => {
  if (process.platform !== "win32") return path.join(projRoot, slug);
  try { const hit = readdirSync(projRoot).find((n) => n.toLowerCase() === slug.toLowerCase()); if (hit) return path.join(projRoot, hit); } catch {}
  return path.join(projRoot, slug);
})();

const targets = [
  [path.join(here, ".env"), "your two API keys"],
  [path.join(here, ".claude", "settings.local.json"), "Claude Code → key B wiring"],
  [ccHistory, "Claude Code history for this folder (it may contain the keys)"],
];

step("Removing your keys");
for (const [p, what] of targets) {
  const shown = p.startsWith(here) ? path.relative(here, p) : p.startsWith(homedir()) ? p.replace(homedir(), "~") : p;
  await checkLine(`${what}  ${c.grey}${shown}${c.reset}`, async () => {
    if (!existsSync(p)) return [null, "not there"];
    rmSync(p, { recursive: true, force: true });
    return [!existsSync(p), existsSync(p) ? "could not delete" : "deleted"];
  }, 250);
}

// Proof: scan this folder for anything that still looks like an OpenRouter key.
out("\n");
step("Making sure no key is left behind");
let leftovers = [];
await checkLine("scanning files for sk-or-v1-…", async () => {
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === ".git" || name === "node_modules") continue;
      const p = path.join(d, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue; // never follow links out of the lab folder
      if (st.isDirectory()) walk(p);
      else if (st.size < 20_000_000 && /sk-or-v1-[a-f0-9]{20,}/.test(readFileSync(p, "latin1"))) leftovers.push(path.relative(here, p));
    }
  };
  walk(here);
  return leftovers.length ? [false, `still found in: ${leftovers.join(", ")}`] : [true, "0 keys found"];
});

// Your work (my-work/, the Excel, the scripts) is yours to keep. Deleting it needs the word "delete".
let removeAll = process.argv.includes("--all");
if (!removeAll && process.stdin.isTTY) {
  out(`\n  ${c.green}✓${c.reset} Your work stays: ${c.white}my-work/${c.reset} ${c.grey}(answers, your Round B programs, badge, receipts)${c.reset}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (isTTY) out("\x1b[?25h");
  const answer = await Promise.race([
    rl.question(`  ${c.pink}▸${c.reset} ${c.bold}Delete the whole lab folder too?${c.reset} ${c.grey}Type${c.reset} ${c.white}delete${c.reset} ${c.grey}to confirm, Enter to keep (20 s):${c.reset} `).catch(() => ""), // Ctrl+D / Ctrl+C = keep
    new Promise((r) => setTimeout(() => r(""), 20_000)),
  ]);
  rl.close();
  if (isTTY) out("\x1b[?25l");
  removeAll = answer.trim().toLowerCase() === "delete";
  if (!removeAll) out(`  ${c.grey}Kept. Your lab folder and my-work/ are still there.${c.reset}\n`);
}
if (removeAll && !isLabFolder(here)) {
  out(`\n  ${c.yellow}Not deleting ${here}: it doesn't look like the lab folder.${c.reset}\n`);
  removeAll = false;
}
if (removeAll) {
  out("\n");
  await checkLine(`lab folder  ${c.grey}${here.replace(homedir(), "~")}${c.reset}`, async () => {
    process.chdir(path.dirname(here));
    try { rmSync(here, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch (e) {
      if (process.platform === "win32" && /EBUSY|EPERM|ENOTEMPTY/.test(e.code)) return [null, `emptied; a terminal/editor is still inside it. Close claude/VS Code, then: cd ..; Remove-Item -Recurse -Force ${path.basename(here)}`];
      throw e;
    }
    return [!existsSync(here), "deleted"];
  });
}

const stamp = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
box([
  leftovers.length ? `${c.red}${c.bold}Not clean yet.${c.reset} Delete the files listed above.` : `${c.green}${c.bold}Clean.${c.reset} No lab keys left on this machine.`,
  `${c.grey}Your keys also stop working tonight at 23:59, wherever they are.${c.reset}`,
  `${c.grey}${stamp}${removeAll ? " · lab folder removed, run: cd .." : ""}${c.reset}`,
  ``,
  `${c.white}Thanks for coming. AI writes. Code runs. AI checks.${c.reset}`,
], leftovers.length ? c.red : c.green);
if (!isTTY && leftovers.length) process.exit(1);

await showQR({ seconds: 20 });

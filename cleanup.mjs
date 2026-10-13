// End of the lab: removes your keys and everything the lab created on this machine, then proves it.
// Usage: node cleanup.mjs          (asks before deleting the whole folder)
//        node cleanup.mjs --all    (also deletes the lab folder, no question)
import { existsSync, rmSync, readdirSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { brandLine, banner, step, checkLine, box, c, isTTY } from "./lib/tui.mjs";

const out = (s) => process.stdout.write(s);
// load the feedback QR now: with --all the folder (and lib/) is gone by the end
const { showQR } = await import("./lib/qr.mjs");
await import("./lib/qr-art.mjs");
const here = process.cwd();
brandLine("cleanup");
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
  [".env", "your two API keys"],
  [".claude/settings.local.json", "Claude Code → key B wiring"],
  ["answers.json", "your answers"],
  ["runs.jsonl", "request log"],
  ["generated", "code written by the orchestrator"],
  [ccHistory, "Claude Code history for this folder"],
];

step("Removing keys and lab files");
for (const [p, what] of targets) {
  const shown = p.startsWith(homedir()) ? p.replace(homedir(), "~") : p;
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
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.size < 20_000_000 && /sk-or-v1-[a-f0-9]{20,}/.test(readFileSync(p, "latin1"))) leftovers.push(path.relative(here, p));
    }
  };
  walk(here);
  return leftovers.length ? [false, `still found in: ${leftovers.join(", ")}`] : [true, "0 keys found"];
});

let removeAll = process.argv.includes("--all");
if (!removeAll && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (isTTY) out("\x1b[?25h");
  const a = await rl.question(`\n  ${c.pink}▸${c.reset} ${c.bold}Delete the whole lab folder too?${c.reset} ${c.grey}(${here.replace(homedir(), "~")})${c.reset} [y/N] `).catch(() => "");
  rl.close();
  if (isTTY) out("\x1b[?25l");
  removeAll = /^y/i.test(a.trim());
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

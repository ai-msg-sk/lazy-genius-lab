// One-command onboarding: node start.mjs [claim code]
// Unlocks your two lab keys from the claim code, checks your machine, pings OpenRouter
// with both keys, and wires Claude Code to key B for this folder only.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { scryptSync, createDecipheriv } from "node:crypto";
import { intro, banner, step, checkLine, decode, box, nextBox, cmd, c, sleep, isTTY } from "./lib/tui.mjs";

const has = (bin, args = ["--version"], opts = {}) => { try { return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000, ...opts }).trim(); } catch { return null; } };
// Python 3 only (the Windows Store alias stub prints "Python was not found" and is not Python).
const py3 = (bin, args = ["--version"]) => { const v = has(bin, args); return v && /Python 3\./.test(v) ? v : null; };
const out = (s) => process.stdout.write(s);

await intro();
await banner("READY", "the lazy genius lab · OpenSlava 2026 · 14 Oct");

// 1. keys
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const get = (n) => env.match(new RegExp(`^${n}=(.+)$`, "m"))?.[1].trim();
let A = get("OPENROUTER_KEY_A"), B = get("OPENROUTER_KEY_B");
// The sheet has a short claim code; it unlocks your two keys from data/keys.sealed.json locally.
function unseal(input) {
  const code = input.toUpperCase().replace(/\s+/g, "");
  const sealed = JSON.parse(readFileSync("data/keys.sealed.json", "utf8"))[code.slice(0, 3)];
  if (!sealed) throw new Error("unknown seat");
  const k = scryptSync(code, Buffer.from(sealed.salt, "base64"), 32, { N: 2 ** 14, r: 8, p: 1 });
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(sealed.iv, "base64"));
  d.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return { code, ...JSON.parse(Buffer.concat([d.update(Buffer.from(sealed.ct, "base64")), d.final()]).toString("utf8")) };
}
let input = process.argv[2], code = null;
if (!A || !B || input) {
  if (!input) {
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      if (isTTY) out("\x1b[?25h");
      input = await rl.question(`  ${c.pink}▸${c.reset} ${c.bold}Claim code from your sheet${c.reset} ${c.grey}(e.g. 012-DUNAJ-K7QX)${c.reset}: `);
      rl.close();
      if (isTTY) out("\x1b[?25l");
    } else input = readFileSync(0, "utf8").split("\n")[0];
  }
  try {
    ({ A, B, code } = unseal(input));
  } catch {
    out(`\n    ${c.red}${c.bold}✗ That code does not open any seat.${c.reset} ${c.grey}Check for typos or raise your hand.${c.reset}\n\n`);
    process.exit(1);
  }
  out("\n");
  step("Unlocking your seat");
  await decode(code, c.pink);
}
A = A.trim(); B = B.trim();
const seat = (code ?? get("LAB_SEAT") ?? "").slice(0, 3);
writeFileSync(".env", `OPENROUTER_KEY_A=${A}\nOPENROUTER_KEY_B=${B}\n${/^\d{3}$/.test(seat) ? `LAB_SEAT=${seat}\n` : ""}`);
mkdirSync("my-work/round-b", { recursive: true }); // everything you make goes here

// 2. machine
out("\n");
step("Checking your machine");
const [maj] = process.versions.node.split(".").map(Number);
let ready = true;
ready = (await checkLine("Node.js", async () => [maj >= 18, maj >= 18 ? process.versions.node : `${process.versions.node}, need 18+ (nodejs.org)`])) && ready;
await checkLine("Python", async () => { const py = py3("python3") ?? py3("python") ?? py3("py", ["-3", "--version"]); return py ? [true, py.replace("Python ", "")] : [null, "not found (optional, used by Round B)"]; });
await checkLine("Claude Code", async () => { const cc = has("claude", ["--version"], process.platform === "win32" ? { shell: true } : {}); return cc ? [true, cc.split(" ")[0]] : [null, "not installed (optional, see the sheet)"]; });
ready = (await checkLine("The Excel", async () => [existsSync("data/openslava-2026-export.xlsx"), "150,000 rows, 6 sheets"])) && ready;

// 3. keys work?
out("\n");
step("Checking your keys");
for (const [name, key, use] of [["A", A, "paste into chat"], ["B", B, "AI writes code"]]) {
  ready = (await checkLine(`key ${name}  ${c.grey}${use}${c.reset}`, async () => {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json();
    if (!r.ok) return [false, `${j.error?.message ?? r.status} (raise your hand)`];
    return [true, `$${(j.data.limit_remaining ?? 0).toFixed(2)} left`];
  })) && ready;
}

// 4. Claude Code -> OpenRouter, key B, cheap model, this folder only
await checkLine("Claude Code wired to key B (Haiku 5.5)", async () => {
  mkdirSync(".claude", { recursive: true });
  writeFileSync(".claude/settings.local.json", JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: B,
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_MODEL: "anthropic/claude-haiku-5.5",
      ANTHROPIC_SMALL_FAST_MODEL: "anthropic/claude-haiku-5.5",
    },
  }, null, 2) + "\n");
  return [true, "this folder only, no login"];
});

if (isTTY) await sleep(200);
if (ready) nextBox([
  `${c.green}${c.bold}You're in.${c.reset}`,
  ``,
  `1  Look at the data (5 min):  ${cmd("node excel.mjs")}`,
  `2  Read the task (2 min):     ${cmd("node task.mjs")}`,
  `3  Round A:                   ${cmd("node 02-paste-into-chat.mjs")}`,
]);
else box([`${c.red}${c.bold}Something is missing.${c.reset} Fix the ✗ above or raise your hand.`], c.red);

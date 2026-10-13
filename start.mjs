// One-command onboarding: node start.mjs
// Asks for your two lab keys, checks your machine, pings OpenRouter with both keys,
// and wires Claude Code to key B for this folder only.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { scryptSync, createDecipheriv } from "node:crypto";

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const has = (cmd, args = ["--version"]) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };

console.log("\n\x1b[1m.msg  ·  OpenSlava '26  ·  The Lazy Genius lab\x1b[0m\n");

// 1. keys
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const get = (n) => env.match(new RegExp(`^${n}=(.+)$`, "m"))?.[1].trim();
let A = get("OPENROUTER_KEY_A"), B = get("OPENROUTER_KEY_B");
// Your card has a short claim code; it unlocks your two keys from data/keys.sealed.json locally.
function unseal(input) {
  const c = input.toUpperCase().replace(/\s+/g, "");
  const box = JSON.parse(readFileSync("data/keys.sealed.json", "utf8"))[c.slice(0, 3)];
  if (!box) throw new Error("unknown seat");
  const k = scryptSync(c, Buffer.from(box.salt, "base64"), 32, { N: 2 ** 14, r: 8, p: 1 });
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(box.iv, "base64"));
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(box.ct, "base64")), d.final()]).toString("utf8"));
}
let input = process.argv[2];
if (!A || !B || input) {
  if (!input) {
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      input = await rl.question("Claim code from your card (e.g. 012-DUNAJ-K7QX): ");
      rl.close();
    } else input = readFileSync(0, "utf8").split("\n")[0];
  }
  try {
    ({ A, B } = unseal(input));
  } catch {
    console.log("\n  \x1b[31m✗\x1b[0m That code does not open any seat. Check for typos or ask the speaker.\n");
    process.exit(1);
  }
}
A = A.trim(); B = B.trim();
writeFileSync(".env", `OPENROUTER_KEY_A=${A}\nOPENROUTER_KEY_B=${B}\n`);

// 2. machine
console.log("\nMachine");
const [maj] = process.versions.node.split(".").map(Number);
maj >= 18 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node}: need 18+`);
const py = has("python3") ?? has("python");
py ? ok(py) : bad("Python 3 not found: get it from python.org (Round B scripts use it), or let your agent use Node")
const cc = has("claude");
cc ? ok(`claude code ${cc.split(" ")[0]}`) : console.log("  · claude code not installed (optional: npm i -g @anthropic-ai/claude-code)");
existsSync("data/openslava-2026-export.xlsx") ? ok("data/openslava-2026-export.xlsx") : bad("dataset missing: re-download the repo");

// 3. keys work?
console.log("\nOpenRouter");
for (const [name, key] of [["A", A], ["B", B]]) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? r.status);
    ok(`key ${name}: $${(j.data.limit_remaining ?? 0).toFixed(2)} left`);
  } catch (e) {
    bad(`key ${name}: ${e.message}  (typo? ask the speaker)`);
  }
}

// 4. Claude Code -> OpenRouter, key B, cheap model, this folder only
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
ok("Claude Code in this folder now runs on key B (Haiku 5.5). Check with /status inside claude.");

console.log(`
Next:
  1. Read TASK.md (2 minutes)
  2. Round A:  node 02-paste-into-chat.mjs        (key A)
  3. Round B:  claude   or   node 03-orchestrator.mjs   (key B)
  4. Check:    node verify.mjs
`);

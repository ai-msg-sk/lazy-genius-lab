// The finale: Round A vs Round B on your own numbers, one idea per screen, then your certificate.
// Usage: node compare.mjs [--devs 10] [--per-day 20] [--days 220] [--reports 20]
// Pages and certificate: lib/finale.mjs. Not a terminal / NO_COLOR / LAB_ASCII: a short summary only.
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { loadResults } from "./lib/results.mjs";
import { runFinale, printSummary, canPage } from "./lib/finale.mjs";
import { ROOT } from "./lib/paths.mjs";
import { out } from "./lib/tui.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const ENV = path.join(ROOT, ".env");
const envText = () => { try { return readFileSync(ENV, "utf8"); } catch { return ""; } };
const envVal = (k) => process.env[k] ?? envText().match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim();

const { A, B, bScore } = await loadResults();
const pages = canPage();

// Ask once for the name on the certificate; remembered in .env (LAB_NAME), also when skipped.
let name = envVal("LAB_NAME");
if (pages && bScore === 5 && name === undefined && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  out("\x1b[?25h");
  name = (await rl.question("\n  Your first name for the certificate (Enter to skip): ")).replace(/[\r\n=]/g, "").trim().slice(0, 18);
  rl.close();
  try { appendFileSync(ENV, `${existsSync(ENV) && !envText().endsWith("\n") && envText() ? "\n" : ""}LAB_NAME=${name}\n`); } catch {}
}
const seat = (envVal("LAB_SEAT") ?? "").replace(/\D/g, "").slice(-3);

if (pages) await runFinale({ A, B, bScore, name: name || "", seat: seat ? seat.padStart(3, "0") : "",
  devs: arg("devs", 10), perDay: arg("per-day", 20), days: arg("days", 220), reports: arg("reports", 20) });
printSummary({ A, B, bScore });

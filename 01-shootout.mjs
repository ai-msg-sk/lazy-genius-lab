// Exercise 1: same math, many models, several runs. Who is right? Who is consistent?
// Usage: node 01-shootout.mjs [runs=3]
import { ask, MODELS, usd } from "./lib/or.mjs";
import { brandLine, banner, step, note, region, box, cmd, spin, vis, c, isTTY, out } from "./lib/tui.mjs";

const RUNS = Number(process.argv[2] ?? 1);

const a = 738_291_046_582_917n, b = 492_018_337_465_201n;
const nums = Array.from({ length: 200 }, (_, i) => ((i * 7919 + 104_729) % 99_991) / 100);
const sum = nums.reduce((s, x) => s + Math.round(x * 100), 0) / 100;

const TASKS = [
  { id: "mul", prompt: `What is ${a} × ${b}? Answer with the number only, no separators.`, truth: String(a * b) },
  { id: "sum", prompt: `Sum these 200 numbers. Answer with the number only, 2 decimals.\n${nums.join(", ")}`, truth: sum.toFixed(2) },
  {
    id: "days",
    prompt: "How many days are there from 2024-02-27 to 2031-11-03 (exclusive of the start date)? Answer with the number only.",
    truth: String((Date.UTC(2031, 10, 3) - Date.UTC(2024, 1, 27)) / 86_400_000),
  },
  {
    id: "loan",
    prompt:
      "Annuity loan: principal 187 450.00 EUR, 4.35 % p.a. nominal, compounded monthly, 300 monthly payments. What is the monthly payment rounded to cents? Number only.",
    truth: (() => {
      const r = 0.0435 / 12, n = 300, P = 187_450;
      return (Math.round(((P * r) / (1 - (1 + r) ** -n)) * 100) / 100).toFixed(2);
    })(),
  },
];

const clean = (s) => s.replace(/[^\d.\-]/g, "").replace(/\.$/, "");
const models = MODELS.cheap;

await brandLine("Exercise 1 · shootout");
await banner("ROUND A", "same math, many models · key A");
step("Ground truth, computed locally in ~0 ms, $0");
for (const t of TASKS) note(`${t.id.padEnd(5)} ${c.white}${t.truth}${c.reset}`);
out("\n");
step(`Asking ${models.length} models × ${TASKS.length} tasks × ${RUNS} run${RUNS > 1 ? "s" : ""}`);

// live table: one cell per model × task, spinner until all runs are in, then ✓ n/n / ✗ / ERR
const done = new Map(); // `${m}|${t.id}` -> [res...]
const key = (m, t) => `${m}|${t.id}`;
const cell = (m, t, f) => {
  const rs = done.get(key(m, t)) ?? [];
  if (rs.length < RUNS) return `${c.pink}${spin(f + t.id.length)}${c.reset}${c.grey}${rs.length ? ` ${rs.length}/${RUNS}` : ""}${c.reset}`;
  if (rs.some((r) => !r.ok)) return `${c.red}ERR${c.reset}`;
  const ok = rs.filter((r) => clean(r.text) === t.truth).length;
  return `${ok === RUNS ? c.green + "✓" : ok ? c.yellow + "~" : c.red + "✗"} ${ok}/${RUNS}${c.reset}`;
};
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vis(s)));
const costOf = (m) => TASKS.reduce((s, t) => s + (done.get(key(m, t)) ?? []).reduce((a, r) => a + r.cost, 0), 0);
const table = (f) => {
  const head = `    ${c.grey}${"model".padEnd(34)}${TASKS.map((t) => t.id.padEnd(8)).join("")}cost${c.reset}`;
  const rows = models.map((m) => `    ${c.white}${m.padEnd(34)}${c.reset}${TASKS.map((t) => pad(cell(m, t, f), 8)).join("")}${c.yellow}${usd(costOf(m))}${c.reset}`);
  const total = models.reduce((s, m) => s + costOf(m), 0);
  return [head, ...rows, `    ${c.grey}${"total".padEnd(34 + TASKS.length * 8)}${c.reset}${c.yellow}${c.bold}${usd(total)}${c.reset}`];
};
const reg = isTTY ? region() : null;
let f = 0;
const tick = isTTY ? setInterval(() => reg.draw(table(f++)), 90) : null;

const jobs = [];
for (const m of models) for (const t of TASKS) for (let r = 0; r < RUNS; r++)
  jobs.push(ask(m, t.prompt, { tag: `A:shootout:${t.id}`, maxTokens: 6000 }).then((res) => {
    done.set(key(m, t), [...(done.get(key(m, t)) ?? []), res]);
    return { m, t, res };
  }));
const results = await Promise.all(jobs);
if (isTTY) { clearInterval(tick); reg.draw(table(f)); } else for (const l of table(0)) out(l + "\n");

const totalCost = results.reduce((s, x) => s + x.res.cost, 0);
box([
  `${c.grey}Total spent${c.reset}  ${c.yellow}${c.bold}${usd(totalCost)}${c.reset}`,
  `The deterministic version: 4 lines of code, $0, 100 % every time.`,
  `${c.grey}Wrong answers are in my-work/receipts.jsonl. Look at how ${c.reset}${c.italic}confidently${c.reset}${c.grey} wrong they are.${c.reset}`,
  ``,
  `Next:  ${cmd("node 02-paste-into-chat.mjs")}`,
]);

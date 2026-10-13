// Exercise 1: same math, many models, several runs. Who is right? Who is consistent?
// Usage: node 01-shootout.mjs [runs=3]
import { ask, MODELS, usd } from "./lib/or.mjs";

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

console.log(`Ground truth (computed locally in ~0 ms, $0):`);
for (const t of TASKS) console.log(`  ${t.id.padEnd(5)} ${t.truth}`);
console.log(`\nAsking ${models.length} models × ${TASKS.length} tasks × ${RUNS} runs ...\n`);

const jobs = [];
for (const m of models) for (const t of TASKS) for (let r = 0; r < RUNS; r++)
  jobs.push(ask(m, t.prompt, { tag: `A:shootout:${t.id}`, maxTokens: 6000 }).then((res) => ({ m, t, res })));
const results = await Promise.all(jobs);

let totalCost = 0;
const header = "model".padEnd(36) + TASKS.map((t) => t.id.padEnd(8)).join("") + "cost";
console.log(header + "\n" + "-".repeat(header.length + 6));
for (const m of models) {
  let line = m.padEnd(36), cost = 0;
  for (const t of TASKS) {
    const rs = results.filter((x) => x.m === m && x.t === t);
    const ok = rs.filter((x) => x.res.ok && clean(x.res.text) === t.truth).length;
    const err = rs.some((x) => !x.res.ok);
    line += (err ? "ERR" : `${ok}/${rs.length}`).padEnd(8);
    cost += rs.reduce((s, x) => s + x.res.cost, 0);
  }
  totalCost += cost;
  console.log(line + usd(cost));
}
console.log(`\nTotal spent: ${usd(totalCost)}. The deterministic version: 4 lines of code, $0, 100 % every time.`);
console.log("Wrong answers are in runs.jsonl. Look at how *confidently* wrong they are.");

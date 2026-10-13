// Checks answers.json against hashed ground truth. Right/wrong per question, no leaks.
import { readFileSync } from "node:fs";
import { check } from "./lib/check.mjs";
import { revealChecks, isTTY } from "./lib/tui.mjs";

let answers;
try {
  answers = JSON.parse(readFileSync(new URL("answers.json", import.meta.url), "utf8"));
} catch {
  console.error("No answers.json yet (or it is not valid JSON). See TASK.md for the format.");
  process.exit(1);
}

const results = check(answers);
if (isTTY) {
  await revealChecks(results);
} else {
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.key.padEnd(38)} ${JSON.stringify(r.value ?? "(missing)")}`);
}
const score = results.filter((r) => r.ok).length;
console.log(`\nScore: ${score}/5${score === 5 ? "  🧠 lazy genius certified" : ""}`);

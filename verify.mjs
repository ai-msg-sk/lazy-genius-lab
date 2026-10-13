// Checks answers.json against hashed ground truth. Right/wrong per question, no leaks.
import { readFileSync } from "node:fs";
import { check } from "./lib/check.mjs";
import { brandLine, step, revealChecks, scoreBox, nextBox, cmd, c, isTTY } from "./lib/tui.mjs";

let answers;
try {
  answers = JSON.parse(readFileSync(new URL("answers.json", import.meta.url), "utf8"));
} catch {
  console.error("No answers.json yet (or it is not valid JSON). See TASK.md for the format.");
  process.exit(1);
}

brandLine("verify");
step("Checking answers.json against the real numbers");
const results = check(answers);
await revealChecks(results);
const score = results.filter((r) => r.ok).length;
if (!isTTY) console.log(`Score: ${score}/5`); // plain line for agents and logs
scoreBox({ score });
if (score === 5) nextBox([
  `Write your Round B score and cost on the sheet.`,
  `Raise your hand: ${c.bold}lowest cost with 5/5 wins ElevenLabs Pro.${c.reset}`,
  ``,
  `When we're done:  ${cmd("node cleanup.mjs")}`,
]);
else nextBox([`Not there yet: ask the AI to fix the ✗ questions, then  ${cmd("node verify.mjs")}`]);

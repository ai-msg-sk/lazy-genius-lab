// Checks answers.json against hashed ground truth. Right/wrong per question, no leaks.
import { readFileSync } from "node:fs";
import { findAnswers, rel } from "./lib/paths.mjs";
import { check } from "./lib/check.mjs";
import { brandLine, step, revealChecks, scoreBox, nextBox, cmd, c, isTTY } from "./lib/tui.mjs";

let answers;
try {
  answers = JSON.parse(readFileSync(findAnswers(), "utf8"));
} catch {
  console.error("No my-work/answers.json yet (or it is not valid JSON). See TASK.md for the format.");
  process.exit(1);
}

await brandLine("verify");
step(`Checking ${rel(findAnswers())} against the real numbers`);
const results = check(answers);
await revealChecks(results);
const score = results.filter((r) => r.ok).length;
if (!isTTY) console.log(`Score: ${score}/5`); // plain line for agents and logs
scoreBox({ score });
if (score === 5 && !process.argv.includes("--no-finale")) {
  // 5/5: show the A-vs-B finale right away (it ends with its own NEXT box)
  const { spawnSync } = await import("node:child_process");
  spawnSync(process.execPath, [new URL("./compare.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { stdio: "inherit" });
} else if (score === 5) nextBox([
  `Write your Round B score and cost on the sheet.`,
  `Raise your hand: ${c.bold}lowest cost with 5/5 wins ElevenLabs Pro.${c.reset}`,
  ``,
  `When we're done:  ${cmd("node cleanup.mjs")}`,
]);
else nextBox([`Not there yet: ask the AI to fix the ✗ questions, then  ${cmd("node verify.mjs")}`]);

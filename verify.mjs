// Checks answers.json against hashed ground truth. Right/wrong per question, no leaks.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dir = new URL(".", import.meta.url);
const hashes = JSON.parse(readFileSync(new URL("answers.hashes.json", dir), "utf8"));
let answers;
try {
  answers = JSON.parse(readFileSync(new URL("answers.json", dir), "utf8"));
} catch {
  console.error("No answers.json yet (or it is not valid JSON). See TASK.md for the format.");
  process.exit(1);
}

// Forgive type sloppiness ("4908" vs 4908, 139609.9 vs "139609.90"); the values still have to be right.
const ints = ["q1_unique_registered_people", "q2_people_who_showed_up", "q5_double_booked_room_pairs"];
for (const k of ints) if (k in answers) answers[k] = Number(answers[k]);
const money = "q4_catering_revenue_2026_10_14_eur";
if (money in answers && !isNaN(Number(String(answers[money]).replace(",", ".")))) answers[money] = Number(String(answers[money]).replace(",", ".")).toFixed(2);
if (typeof answers.q3_winning_talk_id === "string") answers.q3_winning_talk_id = answers.q3_winning_talk_id.trim().toUpperCase();

const h = (v) => createHash("sha256").update("openslava2026:" + JSON.stringify(v)).digest("hex");
let score = 0;
for (const [k, expected] of Object.entries(hashes)) {
  const ok = k in answers && h(answers[k]) === expected;
  score += ok;
  console.log(`${ok ? "✅" : "❌"} ${k.padEnd(38)} ${JSON.stringify(answers[k] ?? "(missing)")}`);
}
console.log(`\nScore: ${score}/5${score === 5 ? "  🧠 lazy genius certified" : ""}`);

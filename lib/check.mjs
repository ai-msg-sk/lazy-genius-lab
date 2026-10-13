// Compares answers with hashed ground truth. Right/wrong per question, never the right value.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const hashes = JSON.parse(readFileSync(new URL("../answers.hashes.json", import.meta.url), "utf8"));
const h = (v) => createHash("sha256").update("openslava2026:" + JSON.stringify(v)).digest("hex");

export const QUESTIONS = {
  q1_unique_registered_people: "people registered",
  q2_people_who_showed_up: "people who came",
  q3_winning_talk_id: "winning talk",
  q4_catering_revenue_2026_10_14_eur: "catering, day 1 (EUR)",
  q5_double_booked_room_pairs: "double-booked rooms",
};

// Forgive type sloppiness ("4908" vs 4908, 139609.9 vs "139609.90"); the values still have to be right.
export function normalize(raw) {
  const a = { ...raw };
  for (const k of ["q1_unique_registered_people", "q2_people_who_showed_up", "q5_double_booked_room_pairs"]) if (a[k] != null && a[k] !== "") a[k] = Number(a[k]);
  const m = "q4_catering_revenue_2026_10_14_eur";
  if (a[m] != null && a[m] !== "" && !isNaN(Number(String(a[m]).replace(",", ".")))) a[m] = Number(String(a[m]).replace(",", ".")).toFixed(2);
  if (typeof a.q3_winning_talk_id === "string") a.q3_winning_talk_id = a.q3_winning_talk_id.trim().toUpperCase();
  return a;
}

export function check(raw, against = hashes) {
  const a = normalize(raw);
  return Object.keys(against).map((k) => ({ key: k, label: QUESTIONS[k], value: a[k], ok: k in a && h(a[k]) === against[k] }));
}
// the bonus export has its own answers
export const bonusHashes = () => JSON.parse(readFileSync(new URL("../data/bonus/answers.hashes.json", import.meta.url), "utf8"));

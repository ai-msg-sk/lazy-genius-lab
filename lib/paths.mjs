// Where everything the attendee (or the AI) produces goes: one folder, my-work/.
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const WORK = path.join(ROOT, "my-work");
export const ANSWERS = path.join(WORK, "answers.json");        // the five answers
export const RECEIPTS = path.join(WORK, "receipts.jsonl");     // cost, tokens, time of every AI call
export const ROUND_B = path.join(WORK, "round-b");             // programs written in Round B
export const ensureWork = () => { mkdirSync(ROUND_B, { recursive: true }); return WORK; };
// answers: my-work/answers.json, or answers.json in the lab root if the agent saved it there
export const findAnswers = () => [ANSWERS, path.join(ROOT, "answers.json")].find((p) => existsSync(p)) ?? null;
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

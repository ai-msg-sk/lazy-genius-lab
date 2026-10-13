// Prints the Round B prompt and copies it to the clipboard again.  Usage: node prompt.mjs
import { ROUND_B_PROMPT, copyToClipboard } from "./lib/clipboard.mjs";
import { c, wrap, cols, cmd, ASCII } from "./lib/tui.mjs";

const copied = copyToClipboard(ROUND_B_PROMPT);
process.stdout.write(`\n  ${c.white}${c.bold}Round B prompt${c.reset} ${c.grey}· ${copied ? "copied to your clipboard, paste it into" : "type this into"}${c.reset} ${cmd("claude")}\n\n`);
for (const l of wrap(ROUND_B_PROMPT, Math.max(30, Math.min(cols() - 8, 90)))) process.stdout.write(`    ${c.violet}${ASCII ? "|" : "┊"} ${l}${c.reset}\n`);
process.stdout.write("\n");

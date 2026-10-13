// The Round B prompt (same text as on the printed sheet, admin/print.mjs) + a best-effort clipboard copy.
import { spawnSync } from "node:child_process";

export const ROUND_B_PROMPT =
  "Read TASK.md. Write a Python script that computes the 5 answers from the Excel and saves it as my-work/answers.json. Run it, then run node verify.mjs. Fix it until 5/5.";

// true if the text landed on the clipboard (macOS pbcopy, Windows clip, Linux wl-copy / xclip); never throws.
export function copyToClipboard(text) {
  const cands = process.platform === "darwin" ? [["pbcopy", []]]
    : process.platform === "win32" ? [["clip", []]]
    : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]]];
  for (const [bin, args] of cands) {
    try {
      const r = spawnSync(bin, args, { input: text, timeout: 2000, stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      if (!r.error && r.status === 0) return true;
    } catch {}
  }
  return false;
}

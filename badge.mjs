// Your "Lazy Genius certified" certificate, in the terminal (made to be photographed).
// Usage: node badge.mjs            the certificate screen (same as page 4 of node compare.mjs)
//        node badge.mjs --html     also write my-work/badge.html (1080×1920 story card) and open it
//                                  [--name "Zuzka"] [--seat 12] [--no-open]
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadResults } from "./lib/results.mjs";
import { runFinale, canPage, printSummary } from "./lib/finale.mjs";
import { ROOT } from "./lib/paths.mjs";
import { brandLine, nextBox, cmd } from "./lib/tui.mjs";

const { A, B, bScore } = await loadResults();
if (process.argv.includes("--html")) {
  await brandLine("lazy genius certified");
  if (bScore !== 5) nextBox([`Get 5/5 in Round B first:  ${cmd("node verify.mjs")}`]);
  else await (await import("./lib/badge.mjs")).showBadge({ A, B });
} else if (bScore === 5 && canPage()) {
  const env = (() => { try { return readFileSync(path.join(ROOT, ".env"), "utf8"); } catch { return ""; } })();
  const val = (k) => process.env[k] ?? env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
  const seat = val("LAB_SEAT").replace(/\D/g, "").slice(-3);
  await runFinale({ A, B, bScore, name: val("LAB_NAME"), seat: seat ? seat.padStart(3, "0") : "" }, { only: "cert" });
} else {
  if (bScore !== 5) nextBox([`Get 5/5 in Round B first:  ${cmd("node verify.mjs")}`]);
  else printSummary({ A, B, bScore });
}

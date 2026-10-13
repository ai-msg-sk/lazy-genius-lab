// Your "Lazy Genius certified" badge for Instagram: my-work/badge.html (1080×1920 story card + PNG download).
// Usage: node badge.mjs [--name "Zuzka"] [--seat 12] [--no-open]
import { loadResults } from "./lib/results.mjs";
import { showBadge } from "./lib/badge.mjs";
import { brandLine, nextBox, cmd } from "./lib/tui.mjs";

await brandLine("lazy genius certified");
const { A, B, bScore } = await loadResults();
if (bScore !== 5) nextBox([`Get 5/5 in Round B first:  ${cmd("node verify.mjs")}`]);
else await showBadge({ A, B });

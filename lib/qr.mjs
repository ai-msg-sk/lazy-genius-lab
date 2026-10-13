// Living QR code for the terminal. It moves (a colour wave and a scan line run through the dark
// modules, modules assemble on entry) but stays scannable: light modules are always white, dark
// modules only ever take very dark colours, and the 4-module quiet zone is kept.
// admin/qr.cjs decodes sampled frames with a real QR reader to prove that.
import { c, sleep, isTTY, ASCII, out, cols } from "./tui.mjs";
import { QR, QR_URL } from "./qr-art.mjs"; // static: cleanup --all deletes the folder before the QR is drawn

export const LIGHT = 231; // white
const INK = 234;           // near-black modules
const SCAN = 89;           // deep raspberry: the scan line (contrast vs white still ~8:1)
// Monochrome on purpose: the only motion inside the code is a soft diagonal scan line.
export function darkColor(x, y, t, n) {
  const sweep = ((t * 0.32) % 1.5) - 0.25;                     // one pass every ~4.7 s
  const d = (x + y) / (2 * n);
  return Math.abs(d - sweep) < 0.02 ? SCAN : INK;
}

const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const Q = 4; // quiet zone in modules (white), required for scanning

// Colour of module (x,y) in quiet-zone coordinates at time t, with the radial build-in.
function moduleColor(rows, x, y, t) {
  const n = rows.length, mx = x - Q, my = y - Q;
  if (mx < 0 || my < 0 || mx >= n || my >= n || rows[my][mx] !== "1") return LIGHT;
  const r = Math.hypot(mx + 0.5 - n / 2, my + 0.5 - n / 2), front = ease(t / 1.6) * (n * 0.75 + 3);
  if (r > front) return LIGHT;
  if (t < 2 && front - r < 1.8) return 161;                     // spark on the build-in front
  return darkColor(mx, my, t, n);
}

// scale 1: half blocks, 2 modules per text row; scale 2: "██" per module, 1 module per row (twice the size)
function qrLines(rows, t, scale) {
  const W = rows.length + 2 * Q, lines = [];
  if (scale === 2) {
    for (let y = 0; y < W; y++) {
      let s = "";
      for (let x = 0; x < W; x++) s += `\x1b[48;5;${moduleColor(rows, x, y, t)}m  `;
      lines.push(s + "\x1b[0m");
    }
  } else {
    for (let y = 0; y < W; y += 2) {
      let s = "";
      for (let x = 0; x < W; x++) s += `\x1b[38;5;${moduleColor(rows, x, y, t)}m\x1b[48;5;${y + 1 < W ? moduleColor(rows, x, y + 1, t) : LIGHT}m▀`;
      lines.push(s + "\x1b[0m");
    }
  }
  return lines;
}

// Rounded frame around the code with a light running along it; title on top, URL at the bottom.
const RUN = [52, 89, 125, 161, 198, 161, 125, 89];
function framed(inner, innerW, t, title, foot) {
  const w = innerW + 4, h = inner.length + 2, per = 2 * (w + h);
  const at = (i) => `\x1b[38;5;${RUN[Math.floor(((i / per) * 40 - t * 9) % RUN.length + RUN.length) % RUN.length]}m`;
  let k = 0;
  const edge = (chars) => [...chars].map((ch) => at(k++) + ch).join("") + "\x1b[0m";
  const label = (txt, len) => { const l = ` ${txt} `; const left = Math.max(1, Math.floor((len - l.length) / 2)); return ["─".repeat(left), l, "─".repeat(Math.max(1, len - left - l.length))]; };
  const [a1, tt, a2] = label(title, w - 2), [b1, ft, b2] = label(foot, w - 2);
  const top = edge("╭" + a1) + `\x1b[1m${tt}\x1b[0m` + edge(a2 + "╮");
  const mid = inner.map((l, i) => `${at(per - i)}│\x1b[0m ${l} ${at(w + i)}│\x1b[0m`);
  const bot = edge("╰" + b1) + `\x1b[38;5;245m${ft}\x1b[0m` + edge(b2 + "╯");
  return [top, ...mid, bot];
}

// Draw the QR centred and sized to the window, build it in, keep it alive (any key ends early).
export async function showQR({ title = "Rate the workshop · 1 minute · scan with your phone", seconds = 25 } = {}) {
  const W = QR.length + 2 * Q, colsN = cols(), rowsN = process.stdout.rows || 40;
  const scale = colsN >= 2 * W + 10 && rowsN >= W + 8 ? 2 : colsN >= W + 8 && rowsN >= Math.ceil(W / 2) + 6 ? 1 : 0;
  if (!isTTY || ASCII || scale === 0) {
    out(`\n  ${c.bold}${title}${c.reset}\n  ${QR_URL}\n${isTTY && !ASCII ? `  ${c.grey}(make the window bigger to see the QR code: node feedback.mjs)${c.reset}\n` : ""}\n`);
    return;
  }
  const innerW = scale === 2 ? 2 * W : W;
  const pad = " ".repeat(Math.max(2, Math.floor((colsN - innerW - 4) / 2)));
  let stop = false;
  const stdin = process.stdin;
  const canKey = stdin.isTTY && typeof stdin.setRawMode === "function";
  const onKey = (b) => { if (b[0] === 3) { out("\x1b[0m\x1b[?25h\n"); process.exit(130); } stop = true; };
  if (canKey) { stdin.setRawMode(true); stdin.resume(); stdin.on("data", onKey); }
  const t0 = Date.now();
  let first = true, H = 0;
  out("\n");
  while (!stop) {
    const t = (Date.now() - t0) / 1000;
    if (t > seconds) break;
    const lines = framed(qrLines(QR, t, scale), innerW, t, title, QR_URL.replace(/^https?:\/\//, ""));
    out((first ? "" : `\x1b[${H}A`) + lines.map((l) => `\r\x1b[2K${pad}${l}\n`).join(""));
    H = lines.length; first = false;
    await sleep(50);
  }
  if (canKey) { stdin.setRawMode(false); stdin.off("data", onKey); stdin.pause(); }
  out("\n");
}

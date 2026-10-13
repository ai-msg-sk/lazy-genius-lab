// Living QR code for the terminal. It moves (a colour wave and a scan line run through the dark
// modules, modules assemble on entry) but stays scannable: light modules are always white, dark
// modules only ever take very dark colours, and the 4-module quiet zone is kept.
// admin/qr.cjs decodes sampled frames with a real QR reader to prove that.
import { c, sleep, isTTY, ASCII, out, cols } from "./tui.mjs";

export const LIGHT = 231; // white
// Only dark colours (black, deep raspberry, deep violet, deep navy): contrast against white stays > 10:1.
const DARKS = [16, 52, 53, 89, 54, 17, 53, 52];
export function darkColor(x, y, t, n) {
  const scan = (t * 0.45) % 1.6 - 0.3;                         // diagonal sweep every ~3.5 s
  const d = (x + y) / (2 * n);
  if (Math.abs(d - scan) < 0.035) return 89;                   // the scan line (deep raspberry)
  const w = Math.sin(x * 0.35 + y * 0.22 - t * 2.2) + Math.sin(y * 0.3 - t * 1.3);
  return DARKS[Math.floor(((w + 2) / 4) * (DARKS.length - 1))];
}

function frame(rows, t, reveal) {
  const n = rows.length, Q = 4, W = n + 2 * Q;
  const isDark = (x, y) => { const mx = x - Q, my = y - Q; return mx >= 0 && my >= 0 && mx < n && my < n && rows[my][mx] === "1" && reveal(mx, my); };
  const color = (x, y) => (isDark(x, y) ? darkColor(x - Q, y - Q, t, n) : LIGHT);
  const lines = [];
  for (let y = 0; y < W; y += 2) {
    let s = "";
    for (let x = 0; x < W; x++) {
      const top = color(x, y), bot = y + 1 < W ? color(x, y + 1) : LIGHT;
      s += `\x1b[38;5;${top}m\x1b[48;5;${bot}m▀`;
    }
    lines.push(s + "\x1b[0m");
  }
  return lines;
}

// Draw the QR centred, assemble it, animate for `seconds` (any key ends early), leave a scannable frame.
export async function showQR({ title = "Rate the workshop · 1 minute", seconds = 25 } = {}) {
  const { QR, QR_URL } = await import("./qr-art.mjs");
  const W = QR.length + 8;
  out(`\n  ${c.bold}${title}${c.reset}  ${c.grey}scan with your phone${c.reset}\n`);
  if (!isTTY || ASCII || cols() < W + 4) { out(`  ${QR_URL}\n\n`); return; }
  const pad = " ".repeat(Math.max(2, Math.floor((cols() - W) / 2)));
  const order = new Map();
  QR.forEach((r, y) => [...r].forEach((_, x) => order.set(`${x},${y}`, Math.random())));
  let stop = false;
  const stdin = process.stdin;
  const canKey = stdin.isTTY && typeof stdin.setRawMode === "function";
  const onKey = (b) => { if (b[0] === 3) { out("\x1b[0m\x1b[?25h\n"); process.exit(130); } stop = true; };
  if (canKey) { stdin.setRawMode(true); stdin.resume(); stdin.on("data", onKey); }
  const H = Math.ceil(W / 2);
  const t0 = Date.now();
  let first = true;
  while (!stop) {
    const t = (Date.now() - t0) / 1000;
    if (t > seconds) break;
    const p = Math.min(1, t / 1.2);                             // modules assemble in random order over 1.2 s
    const lines = frame(QR, t, (x, y) => order.get(`${x},${y}`) <= p);
    out((first ? "" : `\x1b[${H}A`) + lines.map((l) => `\r${pad}${l}\n`).join(""));
    first = false;
    await sleep(60);
  }
  if (canKey) { stdin.setRawMode(false); stdin.off("data", onKey); stdin.pause(); }
  out(`${pad}${c.grey}${QR_URL}${c.reset}\n\n`);
}

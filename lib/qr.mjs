// Living QR code for the terminal. It moves (a colour wave and a scan line run through the dark
// modules, modules assemble on entry) but stays scannable: light modules are always white, dark
// modules only ever take very dark colours, and the 4-module quiet zone is kept.
// admin/qr.cjs decodes sampled frames with a real QR reader to prove that.
import { c, sleep, isTTY, ASCII, out, cols } from "./tui.mjs";
import { QR, QR_URL } from "./qr-art.mjs"; // static: cleanup --all deletes the folder before the QR is drawn

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

const isFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

// One frame: QR (2 modules per char row) + an ambient halo of drifting sparks around the white block.
// The halo lives OUTSIDE the quiet zone, so the code itself stays exactly as scannable.
function frame(rows, t) {
  const n = rows.length, Q = 4, W = n + 2 * Q;
  const cx = n / 2, cy = n / 2, maxR = Math.hypot(cx, cy);
  const front = ease(t / 1.8) * (maxR + 4);                     // radial build-in from the centre, 1.8 s
  const color = (x, y) => {
    const mx = x - Q, my = y - Q;
    if (mx < 0 || my < 0 || mx >= n || my >= n || rows[my][mx] !== "1") return LIGHT;
    const r = Math.hypot(mx + 0.5 - cx, my + 0.5 - cy);
    if (r > front) return LIGHT;                                 // not built yet
    if (front - r < 2.2 && t < 2.2) return 161;                  // spark on the wave front
    if (isFinder(mx, my, n) && t > 1.8 && t < 3.2) {             // finder squares pulse once
      return [89, 125, 89, 53][Math.floor((t - 1.8) * 6) % 4];
    }
    return darkColor(mx, my, t, n);
  };
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

// Sparks around the code: a soft, slowly drifting field of dots in brand colours.
const SPARK = ["·", "·", "∙", "•", "✦", "·"];
const HALO = [53, 54, 89, 97, 125, 133, 139];
function halo(x, y, t) {
  const v = Math.sin(x * 0.9 + t * 1.7) * Math.cos(y * 1.3 - t * 1.1) + Math.sin((x + y) * 0.45 - t * 2.3);
  if (v < 0.55) return " ";
  const i = Math.min(SPARK.length - 1, Math.floor((v - 0.55) * 4));
  return `\x1b[38;5;${HALO[Math.floor((x * 7 + y * 3 + t * 4) % HALO.length)]}m${SPARK[i]}\x1b[0m`;
}

// Draw the QR centred, build it in, keep it alive for `seconds` (any key ends early), leave a clean frame.
export async function showQR({ title = "Rate the workshop · 1 minute", seconds = 25 } = {}) {
  const W = QR.length + 8, M = 3;                               // M = halo margin in columns
  if (!isTTY || ASCII || cols() < W + 2 * M + 4) { out(`\n  ${c.bold}${title}${c.reset}  ${c.grey}scan with your phone${c.reset}\n  ${QR_URL}\n\n`); return; }
  const pad = " ".repeat(Math.max(2, Math.floor((cols() - W - 2 * M) / 2)));
  // title types in
  out("\n" + pad);
  for (const ch of title) { out(`${c.bold}${ch}${c.reset}`); if (ch !== " ") await sleep(14); }
  out(`  ${c.grey}scan with your phone${c.reset}\n`);
  let stop = false;
  const stdin = process.stdin;
  const canKey = stdin.isTTY && typeof stdin.setRawMode === "function";
  const onKey = (b) => { if (b[0] === 3) { out("\x1b[0m\x1b[?25h\n"); process.exit(130); } stop = true; };
  if (canKey) { stdin.setRawMode(true); stdin.resume(); stdin.on("data", onKey); }
  const H = Math.ceil(W / 2) + 2;                                // + one halo row above and below
  const t0 = Date.now();
  let first = true;
  const haloRow = (y, t) => { let s = ""; for (let x = 0; x < W + 2 * M; x++) s += halo(x, y, t); return s; };
  const haloCol = (x0, y, t) => { let s = ""; for (let x = 0; x < M; x++) s += halo(x0 + x, y, t); return s; };
  while (!stop) {
    const t = (Date.now() - t0) / 1000;
    if (t > seconds) break;
    const q = frame(QR, t);
    const lines = [haloRow(0, t), ...q.map((l, i) => `${haloCol(0, i + 1, t)}${l}${haloCol(W + M, i + 1, t)}`), haloRow(q.length + 1, t)];
    out((first ? "" : `\x1b[${H}A`) + lines.map((l) => `\r\x1b[2K${pad}${l}\n`).join(""));
    first = false;
    await sleep(55);
  }
  if (canKey) { stdin.setRawMode(false); stdin.off("data", onKey); stdin.pause(); }
  out(`${pad}${" ".repeat(M)}${c.grey}${QR_URL}${c.reset}\n\n`);
}

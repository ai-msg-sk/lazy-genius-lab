// The last screen: where to find the next workshop. A slow colour field fills the whole window (it never
// enters the QR's white quiet zone), a dark panel in the middle holds one line and the code.
// admin/qr.cjs decodes animation frames with a coloured background around the quiet zone to prove it scans.
import { qrLines, Q } from "./qr.mjs";
import { QR, QR_URL } from "./qr-community.mjs"; // static: cleanup --all deletes the folder before this is drawn
import { c, sleep, isTTY, ASCII, out, cols } from "./tui.mjs";

export const COMMUNITY_URL = QR_URL;
const FOOT = QR_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
// A cyclic ramp in the msg palette: deep wine → raspberry → pink → lavender → violet → back.
const RAMP = [52, 53, 89, 125, 161, 168, 175, 182, 139, 103, 97, 61, 60, 54];
const R = "\x1b[0m", PANEL = "\x1b[48;5;233m", WHITE = "\x1b[38;5;255m", GREY = "\x1b[38;5;247m", RASP = "\x1b[38;5;161m", B = "\x1b[1m";
const vis = (s) => [...s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")].length;

// background colour at pixel (x, y) (y in half-rows) and time t: a few slow interfering waves
function field(x, y, t) {
  const v = Math.sin(x * 0.07 + t * 0.6) + Math.sin(y * 0.13 - t * 0.45) + Math.sin((x + 2 * y) * 0.045 + t * 0.8)
    + Math.sin(Math.hypot(x - 60 - 25 * Math.sin(t * 0.25), 2 * y - 40) * 0.09 - t * 0.9);
  return RAMP[((Math.floor(((v + 4) / 8) * RAMP.length * 2) % RAMP.length) + RAMP.length) % RAMP.length];
}
// one row of background, cells [x0, x1), colour codes only where the colour changes
function bgRow(y, x0, x1, t) {
  let s = "", pf = -1, pb = -1;
  for (let x = x0; x < x1; x++) {
    const f = field(x, 2 * y, t), b = field(x, 2 * y + 1, t);
    if (f !== pf) { s += `\x1b[38;5;${f}m`; pf = f; }
    if (b !== pb) { s += `\x1b[48;5;${b}m`; pb = b; }
    s += "▀";
  }
  return s + R;
}

// Full-screen frame: exactly H lines, each W cells wide.
export function renderCommunity(t, W, H) {
  const head = `${WHITE}${B}Don't miss the next workshops and news${R}`;
  const kick = `${RASP}●${R}${WHITE}${B}msg${R} ${GREY}life · IT community${R}`;
  const url = `${WHITE}${B}${FOOT}${R}`;
  const qrW = (scale) => (QR.length + 2 * Q) * (scale === 2 ? 2 : 1), qrH = (scale) => (scale === 2 ? QR.length + 2 * Q : Math.ceil((QR.length + 2 * Q) / 2));
  // biggest layout that fits: [scale, text lines above, text lines below]
  // pad = blank panel rows above and below; the tight layout (80×24 windows) drops them and the margins
  const layouts = [[2, [kick, "", head, ""], ["", url], 1], [1, [kick, "", head, ""], ["", url], 1], [1, [head], [url], 1], [1, [head], [url], 0], [1, [], [url], 0], [0, [kick, "", head, ""], [url], 1]];
  let pick = null;
  for (const [scale, top, bot, pad] of layouts) {
    const pw = Math.max(scale ? qrW(scale) : 0, ...[...top, ...bot].map(vis)) + (pad ? 8 : 2), ph = top.length + (scale ? qrH(scale) : 0) + bot.length + 2 * pad;
    if (pw <= W - (pad ? 4 : 0) && ph <= H - (pad ? 2 : 0)) { pick = { scale, top, bot, pw, ph, pad }; break; }
  }
  if (!pick) pick = { scale: 0, top: [head], bot: [url], pw: Math.min(W, Math.max(vis(head), vis(url)) + 4), ph: 4, pad: 1 };
  const { scale, top, bot, pw, ph, pad } = pick;
  const centre = (l) => { const k = Math.max(0, pw - vis(l)), a = Math.floor(k / 2); return `${PANEL}${" ".repeat(a)}${l}${PANEL}${" ".repeat(k - a)}${R}`; };
  const panel = [...(pad ? [""] : []), ...top].map(centre);
  if (scale) for (const q of qrLines(QR, t, scale)) { const k = pw - qrW(scale), a = Math.floor(k / 2); panel.push(`${PANEL}${" ".repeat(a)}${R}${q}${PANEL}${" ".repeat(k - a)}${R}`); }
  panel.push(...[...bot, ...(pad ? [""] : [])].map(centre));
  const px = Math.max(0, Math.floor((W - pw) / 2)), py = Math.max(0, Math.floor((H - ph) / 2));
  const lines = [];
  for (let y = 0; y < H; y++) {
    const p = panel[y - py];
    lines.push(p === undefined ? bgRow(y, 0, W, t) : bgRow(y, 0, px, t) + p + bgRow(y, px + pw, W, t));
  }
  return lines;
}

// Stand-alone version (end of cleanup): full screen for `seconds`, any key ends it.
export async function showCommunity({ seconds = 20 } = {}) {
  if (!isTTY || ASCII || cols() < 40 || (process.stdout.rows || 24) < 12) {
    out(`\n  ${c.bold}Don't miss the next workshops and news:${c.reset} ${QR_URL}\n\n`);
    return;
  }
  const stdin = process.stdin, canKey = stdin.isTTY && typeof stdin.setRawMode === "function";
  let stop = false;
  const onKey = (b) => { if (b[0] === 3) { leave(); process.exit(130); } stop = true; };
  const leave = () => out("\x1b[0m\x1b[?1049l\x1b[?25h");
  out("\x1b[?1049h\x1b[?25l\x1b[2J");
  if (canKey) { stdin.setRawMode(true); stdin.resume(); stdin.on("data", onKey); }
  const t0 = Date.now();
  try {
    while (!stop && (Date.now() - t0) / 1000 < seconds) {
      const W = cols(), H = process.stdout.rows || 24, t = (Date.now() - t0) / 1000;
      const lines = renderCommunity(t, W, H - 1);
      const hint = `\x1b[38;5;245many key to close · ${Math.ceil(seconds - t)} s\x1b[0m`;
      out("\x1b[?2026h\x1b[H" + [...lines, " ".repeat(Math.max(0, Math.floor((W - vis(hint)) / 2))) + hint].map((l) => `\x1b[2K${l}`).join("\r\n") + "\x1b[?2026l");
      await sleep(80);
    }
  } finally {
    if (canKey) { stdin.setRawMode(false); stdin.off("data", onKey); stdin.pause(); }
    leave();
  }
  out(`  ${c.grey}Next workshops and news:${c.reset} ${QR_URL}\n\n`);
}

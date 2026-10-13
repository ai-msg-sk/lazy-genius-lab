#!/usr/bin/env node
// show.mjs: a ~30 s looping walk-in piece for the projector. Zero deps, Node 18+.
//   node show.mjs                 loop forever (q or Ctrl+C to quit)
//   node show.mjs --once          play one 30 s loop, then exit
//   node show.mjs --seconds N     play N seconds, then exit
//   node show.mjs --from S        start at second S of the loop (0 logos, 5 rows, 11 round A, 17 round B, 24 motto)
//   node show.mjs --frame S --size 80x24   print one frame as plain text (layout check, no TTY needed)
// Not a TTY / NO_COLOR / ASCII mode: prints a short static version and exits.
import { isTTY, ASCII, highlightPy } from "./lib/tui.mjs";
import { to256 } from "./lib/logos.mjs";
import { ART } from "./lib/logo-art.mjs";

const LOOP = 30;
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const ONCE = argv.includes("--once");
const SECONDS = Number(opt("--seconds")) || (ONCE ? LOOP : Infinity);
const FROM = Number(opt("--from")) || 0;
const FRAME = opt("--frame");
const SIZE = opt("--size");
// --now HH:MM fakes the wall clock (to preview the countdown)
const NOW_OFF = (() => { const v = opt("--now"); if (!v) return 0; const [h, m] = v.split(":").map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0); return d - Date.now(); })();

// ── math ──────────────────────────────────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const p2 = (n) => String(n).padStart(2, "0");
const fmt = (n) => Math.round(n).toLocaleString("en");

// ── 256-colour dimming (fades, wipe edges) ────────────────────────────────────────────────────────
const CUBE = [0, 95, 135, 175, 215, 255];
const BASIC = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
const rgb = (n) => (n < 16 ? BASIC[n] : n < 232 ? [CUBE[Math.floor((n - 16) / 36)], CUBE[Math.floor((n - 16) / 6) % 6], CUBE[(n - 16) % 6]] : Array(3).fill(8 + 10 * (n - 232)));
const LEVELS = 24;
const LUT = Array.from({ length: LEVELS + 1 }, (_, l) => Int16Array.from({ length: 256 }, (_, n) => {
  const k = l / LEVELS;
  if (k >= 1) return n;
  const [r, g, b] = rgb(n).map((v) => v * k);
  return r + g + b < 30 ? 16 : to256([Math.round(r), Math.round(g), Math.round(b)]);
}));
const dim = (n, k) => (n < 0 ? n : LUT[Math.round(clamp(k) * LEVELS)][n]);

// ── frame buffer ──────────────────────────────────────────────────────────────────────────────────
// Every frame is drawn into a grid and written as one string: no flicker, nothing outside the screen.
const BG = 16, DEF = 252;
class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ch = new Array(n).fill(" ");
    this.fg = new Int16Array(n).fill(DEF);
    this.bg = new Int16Array(n).fill(BG);
    this.at = new Uint8Array(n);
  }
  set(x, y, ch, fg, bg, at = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.ch[i] = ch;
    if (fg !== undefined && fg !== null) this.fg[i] = fg;
    if (bg !== undefined && bg !== null) this.bg[i] = bg;
    this.at[i] = at;
  }
  blank(x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < this.w && y < this.h && this.ch[y * this.w + x] === " "; }
  rect(x, y, w, h, bg = BG) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, " ", DEF, bg); }
  // Text with ANSI SGR codes (38;5;n, 48;5;n, 1, 3, 0) - so lib/tui.mjs helpers (highlightPy) work as-is.
  text(x, y, s, { fg = DEF, bg = null, at = 0, max = Infinity } = {}) {
    let f = fg, b = bg, a = at, cx = x, n = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\x1b") {
        const m = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(s.slice(i, i + 40));
        if (m) {
          if (m[2] === "m") {
            const p = m[1].split(";").map(Number);
            for (let k = 0; k < p.length; k++) {
              const v = p[k];
              if (!v) { f = fg; b = bg; a = at; } else if (v === 1) a |= 1; else if (v === 3) a |= 4; else if (v === 22) a &= ~1; else if (v === 23) a &= ~4;
              else if (v === 38 && p[k + 1] === 5) { f = p[k + 2]; k += 2; } else if (v === 48 && p[k + 1] === 5) { b = p[k + 2]; k += 2; }
              else if (v === 39) f = fg; else if (v === 49) b = bg;
            }
          }
          i += m[0].length - 1;
          continue;
        }
      }
      if (n >= max) break;
      const cp = s.codePointAt(i);
      if (cp > 0xffff) i++;
      this.set(cx++, y, String.fromCodePoint(cp), f, b, a);
      n++;
    }
    return cx - x;
  }
  center(y, s, o = {}) {
    const v = Math.min(vis(s), o.max ?? Infinity, this.w - 2);
    const x = Math.max(0, Math.floor((this.w - v) / 2));
    this.text(x, y, s, { ...o, max: v });
    return x;
  }
  box(x, y, w, h, { fg = 240, title = "", bg = null } = {}) {
    if (bg !== null) this.rect(x + 1, y + 1, w - 2, h - 2, bg);
    for (let i = 1; i < w - 1; i++) { this.set(x + i, y, "─", fg); this.set(x + i, y + h - 1, "─", fg); }
    for (let j = 1; j < h - 1; j++) { this.set(x, y + j, "│", fg); this.set(x + w - 1, y + j, "│", fg); }
    this.set(x, y, "╭", fg); this.set(x + w - 1, y, "╮", fg); this.set(x, y + h - 1, "╰", fg); this.set(x + w - 1, y + h - 1, "╯", fg);
    if (title) { this.set(x + 2, y, " ", fg); const n = this.text(x + 3, y, title, { max: w - 7 }); this.set(x + 3 + n, y, " ", fg); }
  }
  fade(k) {
    if (k >= 1) return;
    for (let i = 0; i < this.fg.length; i++) { this.fg[i] = dim(this.fg[i], k); this.bg[i] = dim(this.bg[i], k); }
  }
  ansi() {
    let s = "\x1b[?2026h", cur = "";
    for (let y = 0; y < this.h; y++) {
      s += `\x1b[${y + 1};1H`;
      const end = y === this.h - 1 ? this.w - 1 : this.w; // never touch the bottom-right cell (it can scroll)
      for (let x = 0; x < end; x++) {
        const i = y * this.w + x;
        const a = this.at[i];
        const key = `0${a & 1 ? ";1" : ""}${a & 4 ? ";3" : ""};38;5;${this.fg[i]};48;5;${this.bg[i]}`;
        if (key !== cur) { s += `\x1b[${key}m`; cur = key; }
        s += this.ch[i];
      }
    }
    return s + "\x1b[0m\x1b[?2026l";
  }
  plain() {
    const rows = [];
    for (let y = 0; y < this.h; y++) rows.push(this.ch.slice(y * this.w, (y + 1) * this.w).join("").replace(/\s+$/, ""));
    return rows.join("\n");
  }
}
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const vis = (s) => [...s.replace(ANSI_RE, "")].length;
const C = (n, s) => `\x1b[38;5;${n}m${s}\x1b[39m`;
const B = (s) => `\x1b[1m${s}\x1b[22m`;

// ── big letters (ANSI Shadow) ─────────────────────────────────────────────────────────────────────
const GL = {
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
  C: [" ██████╗", "██╔════╝", "██║     ", "██║     ", "╚██████╗", " ╚═════╝"],
  D: ["██████╗ ", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝ "],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  I: ["██╗", "██║", "██║", "██║", "██║", "╚═╝"],
  K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
  O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  S: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
  T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
  U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  W: ["██╗    ██╗", "██║    ██║", "██║ █╗ ██║", "██║███╗██║", "╚███╔███╔╝", " ╚══╝╚══╝ "],
  0: [" ██████╗ ", "██╔═████╗", "██║██╔██║", "████╔╝██║", "╚██████╔╝", " ╚═════╝ "],
  1: [" ██╗", "███║", "╚██║", " ██║", " ██║", " ╚═╝"],
  2: ["██████╗ ", "╚════██╗", " █████╔╝", "██╔═══╝ ", "███████╗", "╚══════╝"],
  3: ["██████╗ ", "╚════██╗", " █████╔╝", " ╚═══██╗", "██████╔╝", "╚═════╝ "],
  4: ["██╗  ██╗", "██║  ██║", "███████║", "╚════██║", "     ██║", "     ╚═╝"],
  5: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
  6: [" ██████╗ ", "██╔════╝ ", "███████╗ ", "██╔═══██╗", "╚██████╔╝", " ╚═════╝ "],
  7: ["███████╗", "╚════██║", "    ██╔╝", "   ██╔╝ ", "   ██║  ", "   ╚═╝  "],
  8: [" █████╗ ", "██╔══██╗", "╚█████╔╝", "██╔══██╗", "╚█████╔╝", " ╚════╝ "],
  9: [" █████╗ ", "██╔══██╗", "╚██████║", " ╚═══██║", " █████╔╝", " ╚════╝ "],
  ",": ["   ", "   ", "   ", "   ", "▄█╗", "▀═╝"],
  ".": ["   ", "   ", "   ", "   ", "██╗", "╚═╝"],
  "/": ["    ██╗", "   ██╔╝", "  ██╔╝ ", " ██╔╝  ", "██╔╝   ", "╚═╝    "],
  " ": ["   ", "   ", "   ", "   ", "   ", "   "],
};
// rows of the word; slot > 0 = fixed-width digits (odometer)
function big(word, slot = 0) {
  const rows = ["", "", "", "", "", ""];
  for (const ch of word) {
    const g = GL[ch] ?? GL[" "];
    const w = Math.max(...g.map((r) => [...r].length));
    const pad = slot && /\d/.test(ch) ? slot - w : 0;
    for (let r = 0; r < 6; r++) rows[r] += " ".repeat(Math.floor(pad / 2)) + g[r].padEnd(w) + " ".repeat(Math.ceil(pad / 2));
  }
  return rows;
}
const bigW = (rows) => Math.max(...rows.map((r) => [...r].length));
const SHADOW = new Set([..."╗╔╝╚║═"]);
// Draw art rows with a slanted left-to-right wipe: dark cells -> a bright leading edge -> final colour.
// color(ch, col, row) -> 256 colour.
function art(g, x, y, rows, color, p, { edge = true } = {}) {
  const w = Math.max(...rows.map((r) => [...r].length));
  const front = p * (w + 12 + rows.length * 2);
  rows.forEach((row, ry) => [...row].forEach((ch, cx) => {
    if (ch === " ") return;
    const d = front - cx - ry * 2;
    if (d <= 0) return;
    const col = color(ch, cx, ry);
    const f = p >= 1 || d >= 9 ? col : edge && d < 1.5 ? 255 : dim(col, 0.25 + (0.75 * d) / 9);
    g.set(x + cx, y + ry, ch, f);
  }));
}
const shaded = (shades) => (ch, _x, r) => (SHADOW.has(ch) ? dim(shades[r], 0.5) : shades[r]);

// ── fake-but-realistic rows from the 6 sheets ─────────────────────────────────────────────────────
let seed = 20261014;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const FIRST = ["Katarína", "Jakub", "Zuzana", "Tomáš", "Petra", "Matej", "Lenka", "Filip", "Nikola", "Ján", "Lucia", "Peter", "Marek", "Eva", "Martin"];
const LAST = ["Szabóová", "Žák", "Hudáková", "Mikuš", "Koreň", "Lukáč", "Vincze", "Hric", "Tóth", "Kováčová", "Baláž", "Horváth"];
const TALKS = ["eBPF the hard way", "Observability under audit", "Go under audit", "OpenTelemetry for insurance", "Micro-frontends for insurance", "Rust at the edge", "Kafka without tears", "LLMs in production"];
const ITEMS = ["Flat white", "Cappuccino", "Club-Mate", "Espresso", "Croissant", "Bryndzové halušky", "Kofola", "Langoš"];
const ROOMS = ["Tatry", "Poprad", "gerlach", "Ipeľ", "Open space B", " Tatry ", "GERLACH", "Open space A"];
const ascii = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const email = () => { const e = `${ascii(pick(FIRST))}.${ascii(pick(LAST))}@${pick(["azet.sk", "accenture.com", "pantheon.sk", "ness.com", "gmail.com"])}`; return pick([e, e, e.toUpperCase(), ` ${e} `]); };
const ts = (day = pick([13, 14, 14, 14, 15])) => {
  const h = int(7, 20), m = int(0, 59), s = int(0, 59);
  return pick([`${day}.10.2026 ${p2(h)}:${p2(m)}:${p2(s)}`, `2026-10-${day}T${p2(h)}:${p2(m)}:${p2(s)}`, `${day}.10.2026 ${h}:${p2(m)}`, `2026-10-${day} ${p2(h)}:${p2(m)}`]);
};
const badge = () => pick([`R0${int(1000, 7131)}`, `R0${int(1000, 7131)}`, `R0${int(1000, 7131)}`, `GUEST-${int(1, 99)}`, `STAFF-0${int(1, 9)}`, email()]);
const stars = () => pick(["★★★★☆", "★★★★★", "★★★☆☆", "4/5", "3,0", "5", "4", "★★☆☆☆", "2/5", "4,0", "five"]);
const price = () => pick(["3,40 €", "3.1", "2,20 €", "3.50", "4,90 €", "2.2", "12,50 €", "3,10€"]);
const SHEETS = [
  [2, () => `T${p2(int(1, 60))} · ${pick(TALKS)} · Room ${int(1, 4)} · 14.10.2026 · ${p2(int(9, 16))}:00`],
  [8, () => { const f = pick(FIRST), l = pick(LAST); return `R0${int(1000, 7131)} · ${pick([`${f} ${l}`, `${l}, ${f}`, `${f} ${l}`.toUpperCase()])} · ${email()} · ${pick(["Študent", "regular", "STUDENT", "Speaker", "student"])}`; }],
  [20, () => `${ts(14)} · ${pick("ABC")} · ${badge()} · Deň 1`],
  [27, () => `${ts(14)} · ${pick([`T${p2(int(1, 60))}`, pick(TALKS)])} · ${stars()} · ${badge()}${rnd() < 0.3 ? ` · ${pick(["too hot in the room", "couldn't hear the speaker", "great demo", "slides too small"])}` : ""}`],
  [30, () => { const storno = rnd() < 0.12; const it = pick(ITEMS); return `${ts()} · ${pick(["Stánok 1", "Stánok 2", "Bar", "TEST"])} · ${storno ? `STORNO – ${it}` : it} · ${storno ? -1 : int(1, 3)} · ${price()} · ${badge()}`; }],
  [13, () => `P0${int(10000, 21744)} · ${pick(["Rezervácia", "rezervacia", "Booking", "Úloha"])} · ${pick(ROOMS)} · ${int(1, 28)}.${int(1, 12)}.2026 ${int(8, 16)}:${pick(["00", "30"])} · ${pick(["potvrdene", "Potvrdené", "OK", "CONFIRMED", "Zrušené"])}`],
];
const POOL = Array.from({ length: 700 }, () => { let r = rnd() * 100; for (const [w, f] of SHEETS) { if ((r -= w) < 0) return f(); } return SHEETS[4][1](); });
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };

// ── time ──────────────────────────────────────────────────────────────────────────────────────────
function countdown(now = new Date(Date.now() + NOW_OFF)) {
  const t = new Date(now); t.setHours(12, 0, 0, 0);
  const s = Math.floor((t - now) / 1000);
  if (s <= 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

// ── scene 1: logos ────────────────────────────────────────────────────────────────────────────────
const MSG = ART.msg.map((l) => { const cells = []; let dot = false; for (const ch of l) { if (ch === "{") dot = true; else if (ch === "}") dot = false; else cells.push([ch, dot]); } return cells; });
const MSG_ROWS = MSG.map((r) => r.map(([ch]) => ch).join(""));
const WORDMARK = ART.open.map((l, i) => `${l} ${ART.slava[i]} ${ART.n26[i]}`);
const WM_SPLIT = [ART.open[0].length + 1, ART.open[0].length + 1 + ART.slava[0].length + 1];
const TAGLINE = "The lazy genius pattern: Make AI write the math, not do it";

function logos(g, lt, L) {
  const dotCol = lt < 1.2 ? 125 : [125, 161, 197, 161][Math.floor(lt * 6) % 4];
  const isDot = (cx, ry) => MSG[ry][cx]?.[1];
  const wmW = bigW(WORDMARK), elW = bigW(ART.elevenlabs);
  const W = Math.max(wmW, elW);
  if (L.W < W + 4 || L.CH < 18) { // narrow: text lock-up
    const y = Math.floor(L.CH / 2) - 3;
    if (lt > 0.2) g.center(y, `${C(dotCol, "●")}${C(250, B("msg"))}  ${C(244, "×")}  ${C(255, B("OPEN"))}${C(250, "SLAVA")} ${C(255, "'26")}`);
    if (lt > 1.2) g.center(y + 2, `${C(244, "workshop partner")} ${C(255, B("ElevenLabs"))}`);
    if (lt > 2.4) g.center(y + 4, C(248, TAGLINE.slice(0, Math.floor((lt - 2.4) * 40))), { max: L.W - 2 });
    return;
  }
  const roomy = L.CH >= 26;
  const gap = roomy ? 1 : 0;
  const H = 5 + 1 + gap * 2 + 4 + 1 + gap * 2 + 1 + 4 + 1 + gap * 2 + 1;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  const msgX = Math.floor((g.w - bigW(MSG_ROWS)) / 2);
  const dotY = y;
  art(g, msgX, y, MSG_ROWS, (ch, cx, ry) => (isDot(cx, ry) ? dotCol : 250), easeOut(prog(lt, 0.15, 1.3)));
  y += 5 + gap;
  if (lt > 1.0) g.center(y, "×", { fg: dim(244, prog(lt, 1.0, 0.4)) });
  y += 1 + gap;
  art(g, Math.floor((g.w - wmW) / 2), y, WORDMARK, (_ch, cx) => (cx >= WM_SPLIT[0] && cx < WM_SPLIT[1] ? 245 : 255), easeOut(prog(lt, 1.0, 1.3)));
  y += 4 + 1 + gap;
  if (lt > 2.1) {
    const s = "workshop partner", n = Math.floor(prog(lt, 2.1, 0.5) * s.length);
    g.center(y, s.slice(0, n) + [...s.slice(n)].map((ch) => (ch === " " ? " " : pick("abcdefghkmnprstuvwxyz"))).join(""), { fg: 244 });
  }
  y += 1 + gap;
  art(g, Math.floor((g.w - elW) / 2), y, ART.elevenlabs, () => 255, easeOut(prog(lt, 2.3, 1.2)));
  y += 4 + 1 + gap;
  if (lt > 3.2) g.center(y, TAGLINE.slice(0, Math.floor((lt - 3.2) * 70)), { fg: 250, max: g.w - 2 });
  // raspberry dot pulse: an expanding ring around the dot, drawn only on empty cells
  if (lt > 1.2) {
    const q = ((lt - 1.2) % 1.1) / 1.1, r = 0.8 + q * 3.2;
    const cx = msgX + 1, cy = dotY + 2.5;
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const px = cx + Math.cos(a) * r * 2.1, py = cy + Math.sin(a) * r;
      const inside = px > msgX + 3 && py >= dotY - 0.5 && py < dotY + 5.5;
      if (!inside && py >= dotY - 1.5 && py < dotY + 5.5 && g.blank(px, py)) g.set(px, py, "·", dim(161, 1 - q));
    }
  }
}

// ── scene 2: 150,000 rows ─────────────────────────────────────────────────────────────────────────
const SHEET_NAMES = ["Program", "Registrácie", "Vstupy", "Hodnotenia", "Catering", "Office planning"];
function rain(g, lt, L) {
  const colW = L.W >= 140 ? 40 : L.W >= 100 ? 34 : 28, gap = 3;
  const n = Math.max(1, Math.floor((L.W + gap) / (colW + gap)));
  const x0 = Math.floor((L.W - (n * colW + (n - 1) * gap)) / 2);
  const start = easeOut(prog(lt, 0, 1.2));
  for (let c = 0; c < n; c++) {
    const h = hash(c + 7), speed = 6 + (h % 7), trail = 9 + (h % 9), period = L.CH + trail + 10;
    const pos = speed * lt * start + (h % 500);
    const head = ((lt * speed * 2.4 + (h % period)) % period) - 2;
    for (let y = 0; y < L.CH; y++) {
      const j = Math.floor(pos) - y + 100000;
      const row = POOL[(j * 13 + c * 101) % POOL.length];
      const d = head - y;
      const base = 236 + (hash(j * 31 + c) % 4);
      const col = d >= 0 && d < 1 ? 255 : d > 0 && d < trail ? dim(161, 1 - (d / trail) * 0.7) : base;
      const accent = d > 0 && d < trail ? null : 0.32;
      let k = 0;
      for (const ch of row) {
        if (k >= colW) break;
        const f = accent && (ch === "★" || ch === "☆") ? dim(221, accent) : accent && ch === "€" ? dim(42, accent) : col;
        g.set(x0 + c * (colW + gap) + k++, y, ch, f);
      }
    }
  }
  // centre panel: the counter
  const value = 150000 * easeOutExpo(prog(lt, 0.3, 3.4));
  const num = fmt(value);
  const done = lt > 3.7;
  const digits = big("150,000", 9);
  const wide = L.W >= 66 && L.CH >= 17;
  const inner = wide ? Math.max(bigW(digits), 72) : Math.min(L.W - 6, 72);
  const pw = Math.min(L.W - 2, inner + 6), ph = wide ? 14 : 7;
  const px = Math.floor((L.W - pw) / 2), py = Math.floor((L.CH - ph) / 2);
  g.box(px, py, pw, ph, { fg: done ? 125 : 239, bg: BG });
  let y = py + 1;
  if (wide) {
    const rows = big(num, 9), bw = bigW(digits);
    const flash = done && lt < 3.9;
    const shades = flash ? Array(6).fill(255) : [255, 255, 254, 253, 251, 249];
    art(g, px + Math.floor((pw - bw) / 2) + (bw - bigW(rows)), y, rows, (ch, _x, r) => (SHADOW.has(ch) ? 125 : shades[r]), 1, { edge: false });
    y += 6;
  } else {
    g.center(y + 1, num, { fg: 255, at: 1 });
    y += 2;
  }
  g.center(y + (wide ? 1 : 0), `${C(250, "rows in")} ${C(255, B("one messy Excel"))} ${C(250, "·")} ${C(255, B("6 sheets"))}`);
  y += wide ? 3 : 2;
  const names = SHEET_NAMES.map((s, i) => C(lt > 1.1 + i * 0.35 ? (i === Math.floor((lt - 1.1) / 0.35) ? 255 : 248) : 238, s)).join(C(238, " · "));
  g.center(y, names, { max: pw - 4 });
  if (wide && lt > 3.9) g.center(y + 2, C(dim(203, prog(lt, 3.9, 0.4)), "4 date formats · ★★★★☆ = 4/5 = 4,0 · 3,40 € = 3.4 · duplicates · STORNO"), { max: pw - 4 });
}

// ── scene 3: round A, let the AI guess ────────────────────────────────────────────────────────────
const QS = ["unique registered people", "people who showed up", "winning talk", "catering revenue 14.10.", "double-booked room pairs"];
const GUESS = [["7,131", "counted rows, not people"], ["30,322", "counted scans"], ["\"the eBPF one\"", "not even an ID"], ["≈ €52,000", "rounded, from a sample"], ["\"several\"", "vibes"]];

function title(g, y, word, shades, sub, subCol, lt, L, bigOK) {
  if (bigOK) {
    const rows = big(word);
    art(g, Math.floor((L.W - bigW(rows)) / 2), y, rows, shaded(shades), easeOut(prog(lt, 0.05, 0.9)));
    if (lt > 0.6) g.center(y + 6, sub, { fg: subCol });
    return y + 8;
  }
  g.center(y, `${C(shades[0], B(word.replace(/ /g, " ")))}  ${C(244, "·")}  ${C(subCol, sub)}`);
  return y + 2;
}

function scoreBig(g, x, y, txt, shades, lt, at) {
  if (lt < at) return;
  const rows = big(txt);
  const slam = lt - at < 0.12;
  art(g, x, y, rows, slam ? () => 255 : shaded(shades), 1, { edge: false });
}

function roundA(g, lt, L) {
  const bigOK = L.CH >= 34 && L.W >= 64;
  const pasteRows = clamp(L.CH - (bigOK ? 26 : 19), 3, 8);
  const H = (bigOK ? 8 : 2) + pasteRows + 2 + 1 + 1 + 5 + (L.W >= 108 ? 0 : 2);
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  y = title(g, y, "ROUND A", [203, 203, 167, 167, 131, 131], "let the AI guess", 250, lt, L, bigOK);
  // the chat bubble with the pasted Excel
  const bw = Math.min(L.W - 4, 88), bx = Math.floor((L.W - bw) / 2);
  const pasted = Math.min(150000, 150000 * easeInOut(prog(lt, 0.3, 2.3)));
  const reading = lt > 2.6;
  const btitle = reading ? `${C(141, "◆")} ${C(255, B("AI"))} ${C(244, `is reading 150,000 rows ${"⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[Math.floor(lt * 12) % 10]}`)}` : `${C(161, "▸")} ${C(255, B("you"))} ${C(244, "paste the whole Excel into the chat")}`;
  g.box(bx, y, bw, pasteRows + 2, { fg: reading ? 141 : 240, title: btitle });
  const off = Math.floor(pasted / 37);
  for (let i = 0; i < pasteRows; i++) {
    const row = POOL[(off + i * 7) % POOL.length].replace(/ · /g, "\t").replace(/\t/g, "  ");
    g.text(bx + 2, y + 1 + i, row, { fg: reading ? 238 : 238 + Math.min(6, i), max: bw - 4 });
  }
  const tag = ` ${fmt(pasted)} / 150,000 rows pasted `;
  g.text(bx + bw - vis(tag) - 2, y + pasteRows + 1, tag, { fg: 244 });
  y += pasteRows + 2;
  // tickers: time-compressed timer + cost
  const tk = easeInOut(prog(lt, 0.5, 3.4));
  g.center(y, `${C(244, "time")} ${C(255, B(`${(52 * tk).toFixed(1).padStart(4)} s`))}     ${C(244, "cost")} ${C(221, B(`$${(0.15 * tk).toFixed(3)}`))}     ${C(240, "(time-compressed)")}`);
  y += 2;
  // the five confident answers
  const sideScore = L.W >= 108;
  const lw = 2 + 4 + 26 + 16 + 24, lx = Math.floor((L.W - lw - (sideScore ? 30 : 0)) / 2);
  for (let i = 0; i < 5; i++) {
    const at = 3.3 + i * 0.33;
    if (lt < at - 0.2) continue;
    const stamped = lt >= at, flash = stamped && lt - at < 0.14;
    const bg = flash ? 52 : null;
    if (flash) g.rect(lx - 1, y + i, lw + 2, 1, 52);
    g.text(lx, y + i, stamped ? "✗" : " ", { fg: flash ? 255 : 203, at: 1, bg });
    g.text(lx + 2, y + i, `q${i + 1}`, { fg: 244, bg });
    g.text(lx + 6, y + i, QS[i], { fg: 250, bg });
    g.text(lx + 32, y + i, GUESS[i][0], { fg: 255, at: 1, bg });
    if (stamped) g.text(lx + 48, y + i, GUESS[i][1], { fg: flash ? 255 : 167, bg, max: L.W - lx - 49 });
  }
  if (sideScore) {
    scoreBig(g, lx + lw + 6, y - 1, "0/5", [203, 203, 167, 167, 131, 131], lt, 5.0);
    if (lt > 5.15) g.text(lx + lw + 6, y + 5, `$0.15 · 52 s · confidently wrong`, { fg: 244 });
  } else if (lt > 5.0) {
    g.center(y + 6, `${"\x1b[1;38;5;16;48;5;203m"} 0/5 \x1b[0m  ${C(244, "$0.15 · 52 s · confidently wrong")}`);
  }
}

// ── scene 4: round B, let the AI write code ───────────────────────────────────────────────────────
const CODE = `# solve.py · written by the AI, run by your laptop
import openpyxl, json, re
wb = openpyxl.load_workbook("data/openslava-2026-export.xlsx")
rows = lambda s: wb[s].iter_rows(min_row=2, values_only=True)

def email(x): return str(x).strip().lower()
def cents(p): return round(float(re.sub(r"[^\\d,.-]", "", str(p))
                                   .replace(",", ".")) * 100)
def day(ts):  # "14.10.2026 9:05" or "2026-10-14T09:05"
    m = re.search(r"(\\d{4})-(\\d+)-(\\d+)|(\\d+)\\.(\\d+)\\.(\\d{4})", str(ts))
    y, mo, d = m.group(1, 2, 3) if m.group(1) else m.group(6, 5, 4)
    return f"{y}-{int(mo):02}-{int(d):02}"

people = {email(r[2]) for r in rows("Registrácie") if r[2]}
food = sum(r[3] * cents(r[4]) for r in rows("Catering")
           if r[1] != "TEST" and day(r[0]) == "2026-10-14")
# ... q2 scans, q3 ratings, q5 overlapping bookings ...
json.dump({"q1_unique_registered_people": len(people),
           "q4_catering_revenue_2026_10_14_eur": f"{food / 100:.2f}"},
          open("answers.json", "w"), indent=2)`;
const CODE_LINES = CODE.split("\n").length;

function roundB(g, lt, L) {
  const bigOK = L.CH >= 36 && L.W >= 70;
  const sideScore = L.W >= 100;
  const fixed = (bigOK ? 8 : 2) + 2 + 1 + 2 + 1 + (sideScore ? 6 : 1);
  const codeRows = clamp(L.CH - fixed - 2, 4, 16);
  const H = fixed + codeRows;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  y = title(g, y, "ROUND B", [48, 48, 42, 42, 35, 29], "let the AI write code", 250, lt, L, bigOK);
  // code panel
  const pw = Math.min(L.W - 4, 86), px = Math.floor((L.W - pw) / 2);
  const typed = Math.floor(CODE.length * prog(lt, 0.35, 2.8));
  const src = CODE.slice(0, typed).split("\n");
  const first = Math.max(0, src.length - codeRows);
  const writing = typed < CODE.length;
  const cost = 0.014 * prog(lt, 0.35, 2.8);
  g.box(px, y, pw, codeRows + 2, { fg: writing ? 161 : 239, title: `${C(161, "◆")} ${C(255, B("AI"))} ${C(250, writing ? "is writing" : "wrote")} ${C(255, "solve.py")} ${C(244, `· ${src.length} lines · $${cost.toFixed(3)}`)}` });
  for (let i = 0; i < codeRows; i++) {
    const n = first + i;
    if (n >= src.length) break;
    g.text(px + 1, y + 1 + i, `${String(n + 1).padStart(3)} │ `, { fg: 239 });
    const w = g.text(px + 7, y + 1 + i, highlightPy(src[n]), { fg: 252, max: pw - 9 });
    if (n === src.length - 1 && writing && Math.floor(lt * 4) % 2 === 0) g.set(px + 7 + w, y + 1 + i, "▌", 161);
  }
  y += codeRows + 3;
  // the laptop runs it
  if (lt > 3.25) {
    const cmd = "python3 solve.py";
    g.text(px + 2, y, `${C(161, "$")} ${C(255, B(cmd.slice(0, Math.floor(prog(lt, 3.25, 0.25) * cmd.length))))}`);
    g.text(px + 22, y, "your laptop runs it on 150,000 rows", { fg: 244, max: pw - 24 });
    const p = easeInOut(prog(lt, 3.55, 1.0));
    const bw = Math.max(10, Math.min(46, pw - 34));
    const full = p * bw, nf = Math.floor(full);
    const part = " ▏▎▍▌▋▊▉"[Math.floor((full - nf) * 8)];
    const done = p >= 1;
    const bar = "█".repeat(nf) + (nf < bw ? part + "░".repeat(bw - nf - 1) : "");
    g.text(px + 2, y + 1, `${C(done ? 42 : 161, bar.slice(0, nf + 1))}${C(237, bar.slice(nf + 1))}  ${C(255, B(fmt(150000 * p).padStart(7)))} ${C(244, "/ 150,000 rows")}${done ? `  ${C(42, B("done"))}` : ""}`);
  }
  y += 3;
  // the test checks it
  const lw = 2 + 4 + 28 + 10, lx = sideScore ? Math.floor((L.W - lw - 30) / 2) : px + 2;
  if (sideScore) {
    for (let i = 0; i < 5; i++) {
      const at = 4.75 + i * 0.2;
      if (lt < at) continue;
      const flash = lt - at < 0.12, bg = flash ? 22 : null;
      if (flash) g.rect(lx - 1, y + i, lw + 2, 1, 22);
      g.text(lx, y + i, "✓", { fg: flash ? 255 : 42, at: 1, bg });
      g.text(lx + 2, y + i, `q${i + 1}`, { fg: 244, bg });
      g.text(lx + 6, y + i, QS[i], { fg: 250, bg });
      g.text(lx + 34, y + i, "verified", { fg: flash ? 255 : 42, bg });
    }
    scoreBig(g, lx + lw + 6, y - 1, "5/5", [48, 48, 42, 42, 35, 29], lt, 5.9);
    if (lt > 6.05) g.text(lx + lw + 6, y + 5, "$0.014 · checked by a test", { fg: 244 });
  } else {
    let s = "";
    for (let i = 0; i < 5; i++) s += lt >= 4.75 + i * 0.2 ? `${C(42, B("✓"))} ${C(244, `q${i + 1}`)}  ` : "      ";
    if (lt > 5.9) s += ` \x1b[1;38;5;16;48;5;42m 5/5 \x1b[0m ${C(250, "$0.014")}`;
    g.text(px + 2, y, s);
  }
}

// ── scene 5: the motto + countdown ────────────────────────────────────────────────────────────────
const MOTTO = [["AI WRITES.", [161, 162, 163, 164, 135, 141], "AI writes."], ["CODE RUNS.", [255, 254, 253, 251, 249, 247], "Code runs."], ["AI CHECKS.", [48, 48, 42, 42, 35, 29], "AI checks."]];
function finale(g, lt, L) {
  const cd = countdown();
  const canBig = L.W >= bigW(big("CODE RUNS.")) + 2;
  const stacked = canBig && L.CH >= 32;
  const info = 2 + 1 + 1 + 1 + (cd ? 2 : 0) + (L.CH >= 40 ? 2 : 0);
  const H = (stacked ? 20 : canBig ? 8 : 4) + info;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  if (stacked) {
    MOTTO.forEach(([w, sh], i) => {
      const rows = big(w);
      art(g, Math.floor((L.W - bigW(rows)) / 2), y, rows, shaded(sh), easeOut(prog(lt, i * 0.6, 0.9)));
      y += 7;
    });
    y += 1;
  } else if (canBig) {
    const i = Math.min(2, Math.floor(lt / 1.4));
    const rows = big(MOTTO[i][0]);
    art(g, Math.floor((L.W - bigW(rows)) / 2), y, rows, shaded(MOTTO[i][1]), easeOut(prog(lt, i * 1.4, 0.8)));
    y += 7;
    g.center(y, MOTTO.map(([, sh, s], k) => C(k <= i ? sh[1] : 238, B(s))).join("  "));
    y += 2;
  } else {
    MOTTO.forEach(([, sh, s], k) => { if (lt > k * 0.6) g.center(y + k, s, { fg: sh[1], at: 1 }); });
    y += 4;
  }
  if (lt > 2.1) {
    const s = "The lazy genius lab · 12:00 · Room 2";
    g.center(y, s.slice(0, Math.floor(prog(lt, 2.1, 0.6) * s.length)).padEnd(s.length), { fg: 255, at: 1 });
  }
  if (lt > 2.7) g.center(y + 2, `${C(161, "▸")} ${C(250, "get your sheet, open a terminal")}`);
  y += 4;
  if (cd && lt > 3.1) g.center(y, `\x1b[1;38;5;255;48;5;125m  STARTS IN  ${cd}  \x1b[0m`);
  if (L.CH >= 40 && lt > 3.3) g.center(y + (cd ? 3 : 1), "OpenSlava 2026 · 14 Oct · 12:00–14:30 · Jakub Novak, msg life Slovakia · workshop partner ElevenLabs", { fg: 242, max: L.W - 2 });
}

// ── footer + composition ──────────────────────────────────────────────────────────────────────────
const SCENES = [[0, 5, logos], [5, 11, rain], [11, 17, roundA], [17, 24, roundB], [24, 30, finale]];
function footer(g, t, si) {
  const y = g.h - 1;
  const left = `${C(125, "●")}${C(246, B("msg"))} ${C(240, "×")} ${C(252, B("OPEN"))}${C(246, "SLAVA")} ${C(240, "'26")}`;
  const cd = countdown();
  const right = `${C(244, "The lazy genius lab · 12:00 · Room 2")}${cd ? `${C(240, " · in ")}${C(252, cd)}` : ""}`;
  const rshort = `${C(244, "12:00 · Room 2")}${cd ? `${C(240, " · in ")}${C(252, cd)}` : ""}`;
  const dots = SCENES.map((_, i) => (i === si ? C(161, "●") : C(238, "·"))).join(" ");
  g.text(1, y, left);
  const lEnd = 1 + vis(left), dw = vis(dots), dx = Math.floor((g.w - dw) / 2);
  const fits = (r) => g.w - vis(r) - 2 > lEnd + 2;
  const r = fits(right) && g.w - vis(right) - 2 > dx + dw + 2 ? right : rshort;
  if (fits(r)) g.text(g.w - vis(r) - 2, y, r);
  if (dx > lEnd + 2 && dx + dw + 2 < g.w - vis(r) - 2) g.center(y, dots);
}
function render(t, W, H) {
  const g = new Grid(W, H);
  const L = { W, H, CH: Math.max(1, H - 1) };
  const si = SCENES.findIndex(([a, b]) => t >= a && t < b);
  const [a, b, scene] = SCENES[si];
  const lt = t - a, dur = b - a;
  scene(g, lt, L);
  g.fade(easeInOut(clamp(Math.min(lt / 0.4, (dur - lt) / 0.4))));
  if (H >= 8) footer(g, t, si);
  return g;
}

// ── static fallback ───────────────────────────────────────────────────────────────────────────────
function staticText() {
  const cd = countdown();
  process.stdout.write([
    "",
    "  ●msg × OPENSLAVA '26 · workshop partner ElevenLabs",
    "",
    `  ${TAGLINE}`,
    "  14 Oct · 12:00–14:30 · Room 2 · Jakub Novak (msg life Slovakia)",
    "",
    "  One messy Excel: 150,000 rows, 6 sheets. Five questions, two rounds.",
    "    Round A  paste it into an AI, let it guess          0/5 · $0.15 · 52 s",
    "    Round B  the AI writes code, your laptop runs it    5/5 · $0.014",
    "",
    "  AI writes. Code runs. AI checks.",
    `  Get your sheet, open a terminal.${cd ? `  Starts in ${cd}.` : ""}`,
    "",
  ].join("\n") + "\n");
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
if (FRAME !== undefined) {
  const [w, h] = (SIZE ?? "80x24").split("x").map(Number);
  process.stdout.write(render(clamp(Number(FRAME), 0, LOOP - 0.001), w, h).plain() + "\n");
} else if (!isTTY || ASCII) {
  staticText();
} else {
  const out = process.stdout;
  let restored = false, needClear = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
    out.write("\x1b[?2026l\x1b[0m\x1b[2J\x1b[?25h\x1b[?1049l");
  };
  const quit = (code = 0) => { restore(); process.exit(code); };
  process.on("exit", restore);
  process.on("SIGINT", () => quit(130));
  process.on("SIGTERM", () => quit(143));
  process.on("SIGHUP", () => quit(129));
  process.on("uncaughtException", (e) => { restore(); console.error(e); process.exit(1); });
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (d) => { const s = d.toString(); if (/[qQ\x03]/.test(s)) quit(0); });
  }
  out.on("resize", () => { needClear = true; });
  out.write("\x1b[?1049h\x1b[?25l\x1b[2J");
  const t0 = performance.now();
  const tick = () => {
    const el = (performance.now() - t0) / 1000;
    if (el >= SECONDS) return quit(0);
    const W = Math.max(20, out.columns || 80), H = Math.max(6, out.rows || 24);
    let s = render((el + FROM) % LOOP, W, H).ansi();
    if (needClear) { s = "\x1b[2J" + s; needClear = false; }
    out.write(s);
  };
  tick();
  setInterval(tick, 50);
}

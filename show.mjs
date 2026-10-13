#!/usr/bin/env node
// show.mjs: a ~40 s looping walk-in piece for the projector. Zero deps, Node 18+.
//   node show.mjs                 loop forever (q or Ctrl+C to quit)
//   node show.mjs --light         light theme (also LAB_SHOW_THEME=light); dark is the default
//   node show.mjs --once          play one loop, then exit
//   node show.mjs --seconds N     play N seconds, then exit
//   node show.mjs --from S        start at second S of the loop
//                                 (0 logos, 4.5 rows, 10 race, 14 round A, 20 round B, 26.5 bill, 31 motto, 36.5 QR)
//   node show.mjs --frame S --size 80x24 [--ansi]   print one frame (plain text, or coloured with --ansi)
//   node show.mjs --now HH:MM     fake the wall clock (to preview the countdown)
// Not a TTY / NO_COLOR / ASCII mode: prints a short static version and exits.
import { isTTY, ASCII, highlightPy } from "./lib/tui.mjs";
import { to256 } from "./lib/logos.mjs";
import { ART } from "./lib/logo-art.mjs";
import { darkColor, LIGHT as QR_LIGHT } from "./lib/qr.mjs";
import { QR, QR_URL } from "./lib/qr-art.mjs";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const ONCE = argv.includes("--once");
const FROM = Number(opt("--from")) || 0;
const FRAME = opt("--frame");
const SIZE = opt("--size");
const LIGHT = argv.includes("--light") || (process.env.LAB_SHOW_THEME || "").toLowerCase() === "light";
// --now HH:MM fakes the wall clock (to preview the countdown)
const NOW_OFF = (() => { const v = opt("--now"); if (!v) return 0; const [h, m] = v.split(":").map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0); return d - Date.now(); })();

// ── theme ─────────────────────────────────────────────────────────────────────────────────────────
// Semantic 256-colour tokens. Light is designed on its own (grey canvas, white cards, dark ink), not inverted.
const K = LIGHT ? {
  bg: 255, card: 231, ink: 232, text: 234, body: 236, soft: 238, sub: 240, mute: 242, quiet: 244, line: 246, rule: 248, faint: 250, ghost: 251,
  rasp: 125, pink: 161, hot: 162, violet: 97, violet2: 134, green: 28, green2: 34, red: 160, red2: 124, gold: 136, euro: 29,
  onAccent: 231, flashBad: 224, flashOk: 194, fgBad: 160, fgOk: 22, edge: 161, flashInk: 161,
  digits: [232, 232, 233, 234, 235, 236], redSh: [160, 160, 124, 124, 88, 88], greenSh: [34, 34, 28, 28, 22, 22],
  aiSh: [161, 161, 125, 125, 97, 97], codeSh: [232, 233, 234, 235, 236, 237], dot: [125, 161, 162, 161],
  msgInk: 238, open: 232, slava: 243, eleven: 232, rain: [247, 248, 249, 250], paste: (i) => 251 - Math.min(6, i),
  shimmer: [231, 231], sheen: [1.5, 9], dust: [251, 252, 253], paper: 231, shadow: 251, hl: { 161: 125, 42: 28, 221: 136, 141: 97, 245: 244 },
} : {
  bg: 16, card: 16, ink: 255, text: 252, body: 250, soft: 248, sub: 246, mute: 244, quiet: 242, line: 240, rule: 239, faint: 238, ghost: 237,
  rasp: 125, pink: 161, hot: 197, violet: 141, violet2: 135, green: 42, green2: 48, red: 203, red2: 167, gold: 221, euro: 42,
  onAccent: 16, flashBad: 52, flashOk: 22, fgBad: 255, fgOk: 255, edge: 255, flashInk: 255,
  digits: [255, 255, 254, 253, 251, 249], redSh: [203, 203, 167, 167, 131, 131], greenSh: [48, 48, 42, 42, 35, 29],
  aiSh: [161, 162, 163, 164, 135, 141], codeSh: [255, 254, 253, 251, 249, 247], dot: [125, 161, 197, 161],
  msgInk: 250, open: 255, slava: 245, eleven: 255, rain: [236, 237, 238, 239], paste: (i) => 238 + Math.min(6, i),
  shimmer: [232, 233], sheen: [0.95, 1.5], dust: [235, 236, 237], paper: 254, shadow: 233, hl: null,
};
// receipt paper is light in both themes: fixed ink for it
const P = { ink: 235, mute: 243, rule: 247, rasp: 125, red: 160, green: 28 };
const hl = (s) => (K.hl ? highlightPy(s).replace(/38;5;(\d+)/g, (m, n) => `38;5;${K.hl[n] ?? n}`) : highlightPy(s));

// ── math ──────────────────────────────────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, start, dur) => clamp((t - start) / dur);
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const p2 = (n) => String(n).padStart(2, "0");
const fmt = (n) => Math.round(n).toLocaleString("en");

// ── 256-colour mixing toward the canvas (fades, wipe edges, trails) ───────────────────────────────
const CUBE = [0, 95, 135, 175, 215, 255];
const BASIC = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
const rgb = (n) => (n < 16 ? BASIC[n] : n < 232 ? [CUBE[Math.floor((n - 16) / 36)], CUBE[Math.floor((n - 16) / 6) % 6], CUBE[(n - 16) % 6]] : Array(3).fill(8 + 10 * (n - 232)));
const LEVELS = 24;
const BG_RGB = rgb(K.bg);
const LUT = Array.from({ length: LEVELS + 1 }, (_, l) => Int16Array.from({ length: 256 }, (_, n) => {
  const k = l / LEVELS;
  if (k >= 1) return n;
  const c = rgb(n).map((v, j) => Math.round(v * k + BG_RGB[j] * (1 - k)));
  return Math.abs(c[0] - BG_RGB[0]) + Math.abs(c[1] - BG_RGB[1]) + Math.abs(c[2] - BG_RGB[2]) < 18 ? K.bg : to256(c);
}));
const dim = (n, k) => (n < 0 ? n : LUT[Math.round(clamp(k) * LEVELS)][n]);

// ── frame buffer ──────────────────────────────────────────────────────────────────────────────────
// Every frame is drawn into a grid and written as one string: no flicker, nothing outside the screen.
class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ch = new Array(n).fill(" ");
    this.fg = new Int16Array(n).fill(K.text);
    this.bg = new Int16Array(n).fill(K.bg);
    this.at = new Uint8Array(n);
    this.amb = new Uint8Array(n); // 1 = ambient particle (counts as blank)
  }
  set(x, y, ch, fg, bg, at = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.ch[i] = ch;
    if (fg !== undefined && fg !== null) this.fg[i] = fg;
    if (bg !== undefined && bg !== null) this.bg[i] = bg;
    this.at[i] = at;
    this.amb[i] = 0;
  }
  blank(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false; const i = y * this.w + x; return this.ch[i] === " " || this.amb[i] === 1; }
  rect(x, y, w, h, bg = K.bg) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, " ", K.text, bg); }
  // Text with ANSI SGR codes (38;5;n, 48;5;n, 1, 3, 0) - so lib/tui.mjs helpers (highlightPy) work as-is.
  text(x, y, s, { fg = K.text, bg = null, at = 0, max = Infinity } = {}) {
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
  box(x, y, w, h, { fg = K.line, title = "", bg = null, dbl = false } = {}) {
    if (bg !== null) this.rect(x + 1, y + 1, w - 2, h - 2, bg);
    const [hz, vt, tl, tr, bl, br] = dbl ? [..."═║╔╗╚╝"] : [..."─│╭╮╰╯"];
    for (let i = 1; i < w - 1; i++) { this.set(x + i, y, hz, fg, bg); this.set(x + i, y + h - 1, hz, fg, bg); }
    for (let j = 1; j < h - 1; j++) { this.set(x, y + j, vt, fg, bg); this.set(x + w - 1, y + j, vt, fg, bg); }
    this.set(x, y, tl, fg, bg); this.set(x + w - 1, y, tr, fg, bg); this.set(x, y + h - 1, bl, fg, bg); this.set(x + w - 1, y + h - 1, br, fg, bg);
    if (title) { this.set(x + 2, y, " ", fg, bg); const n = this.text(x + 3, y, title, { max: w - 7, bg }); this.set(x + 3 + n, y, " ", fg, bg); }
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
const badge = (fgc, bgc, s) => `\x1b[1;38;5;${fgc};48;5;${bgc}m${s}\x1b[0m`;
const spaced = (s) => [...s].join(" ");

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
  X: ["██╗  ██╗", "╚██╗██╔╝", " ╚███╔╝ ", " ██╔██╗ ", "██╔╝ ██╗", "╚═╝  ╚═╝"],
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
// Draw art rows with a slanted left-to-right wipe: faint cells -> a bright leading edge -> final colour.
// color(ch, col, row) -> 256 colour.
function art(g, x, y, rows, color, p, { edge = true } = {}) {
  const w = Math.max(...rows.map((r) => [...r].length));
  const front = p * (w + 12 + rows.length * 2);
  rows.forEach((row, ry) => [...row].forEach((ch, cx) => {
    if (ch === " ") return;
    const d = front - cx - ry * 2;
    if (d <= 0) return;
    const col = color(ch, cx, ry);
    const f = p >= 1 || d >= 9 ? col : edge && d < 1.5 ? K.edge : dim(col, 0.25 + (0.75 * d) / 9);
    g.set(x + cx, y + ry, ch, f);
  }));
}
const shaded = (shades) => (ch, _x, r) => (SHADOW.has(ch) ? dim(shades[r], 0.5) : shades[r]);
// progress bar with 1/8 partial cells
function bar(g, x, y, w, frac, col, rest = K.ghost) {
  const full = clamp(frac) * w, nf = Math.floor(full);
  const part = frac > 0 && nf < w ? " ▏▎▍▌▋▊▉"[Math.max(1, Math.floor((full - nf) * 8))] : "";
  for (let i = 0; i < w; i++) {
    if (i < nf) g.set(x + i, y, "█", col);
    else if (i === nf && part) g.set(x + i, y, part, col);
    else g.set(x + i, y, "░", rest);
  }
}

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
const badgeId = () => pick([`R0${int(1000, 7131)}`, `R0${int(1000, 7131)}`, `R0${int(1000, 7131)}`, `GUEST-${int(1, 99)}`, `STAFF-0${int(1, 9)}`, email()]);
const stars = () => pick(["★★★★☆", "★★★★★", "★★★☆☆", "4/5", "3,0", "5", "4", "★★☆☆☆", "2/5", "4,0", "five"]);
const price = () => pick(["3,40 €", "3.1", "2,20 €", "3.50", "4,90 €", "2.2", "12,50 €", "3,10€"]);
const SHEETS = [
  [2, () => `T${p2(int(1, 60))} · ${pick(TALKS)} · Room ${int(1, 4)} · 14.10.2026 · ${p2(int(9, 16))}:00`],
  [8, () => { const f = pick(FIRST), l = pick(LAST); return `R0${int(1000, 7131)} · ${pick([`${f} ${l}`, `${l}, ${f}`, `${f} ${l}`.toUpperCase()])} · ${email()} · ${pick(["Študent", "regular", "STUDENT", "Speaker", "student"])}`; }],
  [20, () => `${ts(14)} · ${pick("ABC")} · ${badgeId()} · Deň 1`],
  [27, () => `${ts(14)} · ${pick([`T${p2(int(1, 60))}`, pick(TALKS)])} · ${stars()} · ${badgeId()}${rnd() < 0.3 ? ` · ${pick(["too hot in the room", "couldn't hear the speaker", "great demo", "slides too small"])}` : ""}`],
  [30, () => { const storno = rnd() < 0.12; const it = pick(ITEMS); return `${ts()} · ${pick(["Stánok 1", "Stánok 2", "Bar", "TEST"])} · ${storno ? `STORNO – ${it}` : it} · ${storno ? -1 : int(1, 3)} · ${price()} · ${badgeId()}`; }],
  [13, () => `P0${int(10000, 21744)} · ${pick(["Rezervácia", "rezervacia", "Booking", "Úloha"])} · ${pick(ROOMS)} · ${int(1, 28)}.${int(1, 12)}.2026 ${int(8, 16)}:${pick(["00", "30"])} · ${pick(["potvrdene", "Potvrdené", "OK", "CONFIRMED", "Zrušené"])}`],
];
const POOL = Array.from({ length: 700 }, () => { let r = rnd() * 100; for (const [w, f] of SHEETS) { if ((r -= w) < 0) return f(); } return SHEETS[4][1](); });
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const h01 = (n) => hash(n) / 4294967296;

// ── time ──────────────────────────────────────────────────────────────────────────────────────────
function countdown(now = new Date(Date.now() + NOW_OFF)) {
  const t = new Date(now); t.setHours(12, 0, 0, 0);
  const s = Math.floor((t - now) / 1000);
  if (s <= 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}

// ── ambient layer: slow sheen + drifting dust, periodic in the loop (no jump at the wrap) ─────────
function ambient(g, t) {
  const ph = (t / LOOP) * Math.PI * 2;
  const [s1, s2] = K.shimmer;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const v = Math.sin(x * 0.055 + y * 0.17 - ph * 3) + Math.sin(x * 0.021 - y * 0.07 + ph * 2);
    if (v > K.sheen[0]) g.bg[y * g.w + x] = v > K.sheen[1] ? s2 : s1;
  }
  const n = Math.floor((g.w * g.h) / 110);
  for (let i = 0; i < n; i++) {
    const a = hash(i * 3 + 11), b = hash(i * 3 + 12), c = hash(i * 3 + 13);
    const laps = (1 + (c % 3)) * (c & 8 ? 1 : -1);
    const x = ((((a % g.w) + (t / LOOP) * g.w * laps) % g.w) + g.w) % g.w;
    const y = Math.round((b % g.h) + Math.sin(ph * (1 + (c % 2)) + (a % 100)) * 1.2);
    if (y < 0 || y >= g.h - 1) continue; // keep the footer row clean
    g.set(x, y, "·∙·˙"[c % 4], K.dust[(b >>> 4) % 3]);
    g.amb[y * g.w + Math.round(x) % g.w] = 1;
  }
}

// ── scene: logos ──────────────────────────────────────────────────────────────────────────────────
const MSG = ART.msg.map((l) => { const cells = []; let dot = false; for (const ch of l) { if (ch === "{") dot = true; else if (ch === "}") dot = false; else cells.push([ch, dot]); } return cells; });
const MSG_ROWS = MSG.map((r) => r.map(([ch]) => ch).join(""));
const WORDMARK = ART.open.map((l, i) => `${l} ${ART.slava[i]} ${ART.n26[i]}`);
const WM_SPLIT = [ART.open[0].length + 1, ART.open[0].length + 1 + ART.slava[0].length + 1];
const TAGLINE = "The lazy genius pattern: Make AI write the math, not do it";

function logos(g, lt, L) {
  const dotCol = lt < 1.2 ? K.rasp : K.dot[Math.floor(lt * 6) % 4];
  const isDot = (cx, ry) => MSG[ry][cx]?.[1];
  const wmW = bigW(WORDMARK), elW = bigW(ART.elevenlabs);
  const W = Math.max(wmW, elW);
  if (L.W < W + 4 || L.CH < 18) { // narrow: text lock-up
    const y = Math.floor(L.CH / 2) - 3;
    if (lt > 0.2) g.center(y, `${C(dotCol, "●")}${C(K.msgInk, B("msg"))}  ${C(K.mute, "×")}  ${C(K.open, B("OPEN"))}${C(K.slava, "SLAVA")} ${C(K.open, "'26")}`);
    if (lt > 1.2) g.center(y + 2, `${C(K.mute, "workshop partner")} ${C(K.eleven, B("ElevenLabs"))}`);
    if (lt > 2.4) g.center(y + 4, C(K.soft, TAGLINE.slice(0, Math.floor((lt - 2.4) * 40))), { max: L.W - 2 });
    return;
  }
  const roomy = L.CH >= 26;
  const gap = roomy ? 1 : 0;
  const H = 5 + 1 + gap * 2 + 4 + 1 + gap * 2 + 1 + 4 + 1 + gap * 2 + 1;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  const msgX = Math.floor((g.w - bigW(MSG_ROWS)) / 2);
  const dotY = y;
  art(g, msgX, y, MSG_ROWS, (ch, cx, ry) => (isDot(cx, ry) ? dotCol : K.msgInk), easeOut(prog(lt, 0.15, 1.3)));
  y += 5 + gap;
  if (lt > 1.0) g.center(y, "×", { fg: dim(K.mute, prog(lt, 1.0, 0.4)) });
  y += 1 + gap;
  art(g, Math.floor((g.w - wmW) / 2), y, WORDMARK, (_ch, cx) => (cx >= WM_SPLIT[0] && cx < WM_SPLIT[1] ? K.slava : K.open), easeOut(prog(lt, 1.0, 1.3)));
  y += 4 + 1 + gap;
  if (lt > 2.1) {
    const s = "workshop partner", n = Math.floor(prog(lt, 2.1, 0.5) * s.length);
    g.center(y, s.slice(0, n) + [...s.slice(n)].map((ch) => (ch === " " ? " " : pick("abcdefghkmnprstuvwxyz"))).join(""), { fg: K.mute });
  }
  y += 1 + gap;
  art(g, Math.floor((g.w - elW) / 2), y, ART.elevenlabs, () => K.eleven, easeOut(prog(lt, 2.3, 1.2)));
  y += 4 + 1 + gap;
  if (lt > 3.2) g.center(y, TAGLINE.slice(0, Math.floor((lt - 3.2) * 70)), { fg: K.body, max: g.w - 2 });
  // raspberry dot pulse: an expanding ring around the dot, drawn only on empty cells
  if (lt > 1.2) {
    const q = ((lt - 1.2) % 1.1) / 1.1, r = 0.8 + q * 3.2;
    const cx = msgX + 1, cy = dotY + 2.5;
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const px = cx + Math.cos(a) * r * 2.1, py = cy + Math.sin(a) * r;
      const inside = px > msgX + 3 && py >= dotY - 0.5 && py < dotY + 5.5;
      if (!inside && py >= dotY - 1.5 && py < dotY + 5.5 && g.blank(px, py)) g.set(px, py, "·", dim(K.pink, 1 - q));
    }
  }
}

// ── scene: 150,000 rows ───────────────────────────────────────────────────────────────────────────
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
      const base = K.rain[hash(j * 31 + c) % 4];
      const col = d >= 0 && d < 1 ? K.ink : d > 0 && d < trail ? dim(K.pink, 1 - (d / trail) * 0.7) : base;
      const accent = d > 0 && d < trail ? null : 0.32;
      let k = 0;
      for (const ch of row) {
        if (k >= colW) break;
        const f = accent && (ch === "★" || ch === "☆") ? dim(K.gold, accent) : accent && ch === "€" ? dim(K.euro, accent) : col;
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
  g.box(px, py, pw, ph, { fg: done ? K.rasp : K.rule, bg: K.card });
  let y = py + 1;
  if (wide) {
    const rows = big(num, 9), bw = bigW(digits);
    const flash = done && lt < 3.9;
    const shades = flash ? Array(6).fill(K.flashInk) : K.digits;
    art(g, px + Math.floor((pw - bw) / 2) + (bw - bigW(rows)), y, rows, (ch, _x, r) => (SHADOW.has(ch) ? K.rasp : shades[r]), 1, { edge: false });
    y += 6;
  } else {
    g.center(y + 1, num, { fg: K.ink, at: 1 });
    y += 2;
  }
  g.center(y + (wide ? 1 : 0), `${C(K.body, "rows in")} ${C(K.ink, B("one messy Excel"))} ${C(K.body, "·")} ${C(K.ink, B("6 sheets"))}`);
  y += wide ? 3 : 2;
  const names = SHEET_NAMES.map((s, i) => C(lt > 1.1 + i * 0.35 ? (i === Math.floor((lt - 1.1) / 0.35) ? K.ink : K.soft) : K.faint, s)).join(C(K.faint, " · "));
  g.center(y, names, { max: pw - 4 });
  if (wide && lt > 3.9) g.center(y + 2, C(dim(K.red, prog(lt, 3.9, 0.4)), "4 date formats · ★★★★☆ = 4/5 = 4,0 · 3,40 € = 3.4 · duplicates · STORNO"), { max: pw - 4 });
}

// ── scene: who reads the rows? (a race) ───────────────────────────────────────────────────────────
function typeTitle(g, y, s, lt, at = 0.05, dur = 0.5) {
  const n = Math.floor(prog(lt, at, dur) * s.length);
  const x = g.center(y, s.slice(0, n).padEnd(s.length), { fg: K.ink, at: 1 });
  if (n >= s.length && s.endsWith("?")) g.set(x + s.length - 1, y, "?", K.pink, null, 1);
  return x;
}
function race(g, lt, L) {
  const pw = Math.min(L.W - 4, 92), px = Math.floor((L.W - pw) / 2);
  const roomy = L.CH >= 20;
  const H = 2 + (roomy ? 1 : 0) + 4 + 1 + 4 + 2;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  typeTitle(g, y, L.W >= 50 ? spaced("WHO READS THE ROWS?") : "WHO READS THE ROWS?", lt);
  if (lt > 0.45) g.center(y + 1, `${C(K.mute, "same")} ${C(K.body, "150,000 rows")} ${C(K.mute, "· two readers")}`);
  y += roomy ? 3 : 2;
  // the AI: chunky, slow, and then the context is full
  const aiRows = Math.floor((4500 * easeOut(prog(lt, 0.45, 2.2))) / 50) * 50;
  const full = lt > 2.7;
  const blink = Math.floor(lt * 3) % 2 === 0;
  g.box(px, y, pw, 4, { fg: full ? K.red : K.violet, bg: K.card, title: `${C(K.violet, "◆")} ${C(K.ink, B("the AI"))} ${C(K.mute, "reads them, token by token")}` });
  const labA = `${fmt(aiRows).padStart(7)} / 150,000 ${C(full ? K.red : K.violet, B(`${(aiRows / 1500).toFixed(1).padStart(4)} %`))}`;
  const bwA = Math.max(6, pw - 6 - vis(labA));
  bar(g, px + 2, y + 1, bwA, aiRows / 150000 + (aiRows ? 0.004 : 0), full ? K.red : K.violet);
  g.text(px + 4 + bwA, y + 1, labA, { fg: K.ink });
  if (!full) {
    const row = POOL[Math.floor(aiRows / 50) % POOL.length], k = Math.floor((lt * 26) % (row.length + 10));
    const pre = `${C(K.quiet, "reading")}  ${C(K.body, row.slice(0, k))}${C(K.violet, "▌")}`;
    g.text(px + 2, y + 2, pre, { max: pw - 22 });
    const tok = `${fmt(aiRows * 22)} tokens`;
    g.text(px + pw - 2 - tok.length, y + 2, tok, { fg: K.mute });
  } else {
    g.text(px + 2, y + 2, `${C(blink ? K.red : K.red2, B("⚠ context full"))} ${C(K.body, "at ~99,000 tokens ·")} ${C(K.ink, "it guesses the other 97 %")}`, { max: pw - 4 });
  }
  y += 5;
  // the for-loop: boring and instant
  const lp = easeInOut(prog(lt, 1.0, 0.9)), done = lp >= 1;
  g.box(px, y, pw, 4, { fg: done ? K.green : K.pink, bg: K.card, title: `${C(K.pink, "▸")} ${C(K.ink, B("for row in rows:"))} ${C(K.mute, "your laptop, one Python loop")}` });
  const labB = `${fmt(150000 * lp).padStart(7)} / 150,000 ${C(done ? K.green : K.pink, B(`${(0.41 * lp).toFixed(2)} s`))}`;
  const bwB = Math.max(6, pw - 6 - vis(labB));
  bar(g, px + 2, y + 1, bwB, lp, done ? K.green : K.pink);
  g.text(px + 4 + bwB, y + 1, labB, { fg: K.ink });
  if (lp > 0 && !done) g.text(px + 2, y + 2, POOL[Math.floor(lt * 97) % POOL.length], { fg: K.faint, max: pw - 4 });
  else if (done) g.text(px + 2, y + 2, `${C(K.green, B("✓ every row, every time"))} ${C(K.mute, "· $0.000 · no tokens")}`, { max: pw - 4 });
  y += 5;
  if (lt > 2.9) {
    const s = "Don't make the AI read the rows. Make it write the loop.";
    const n = Math.floor(prog(lt, 2.9, 0.6) * s.length), cut = 33;
    const shown = s.slice(0, n);
    g.center(y, `${C(K.body, shown.slice(0, cut))}${C(K.pink, B(shown.slice(cut)))}${" ".repeat(s.length - n)}`, { max: L.W - 2 });
  }
}

// ── scene: round A, let the AI guess ──────────────────────────────────────────────────────────────
const QS = ["unique registered people", "people who showed up", "winning talk", "catering revenue 14.10.", "double-booked room pairs"];
const GUESS = [["7,131", "counted rows, not people"], ["30,322", "counted scans"], ["\"the eBPF one\"", "not even an ID"], ["≈ €52,000", "rounded, from a sample"], ["\"several\"", "vibes"]];

function title(g, y, word, shades, sub, subCol, lt, L, bigOK) {
  if (bigOK) {
    const rows = big(word);
    art(g, Math.floor((L.W - bigW(rows)) / 2), y, rows, shaded(shades), easeOut(prog(lt, 0.05, 0.9)));
    if (lt > 0.6) g.center(y + 6, sub, { fg: subCol });
    return y + 8;
  }
  g.center(y, `${C(shades[0], B(word.replace(/ /g, " ")))}  ${C(K.mute, "·")}  ${C(subCol, sub)}`);
  return y + 2;
}

function scoreBig(g, x, y, txt, shades, lt, at) {
  if (lt < at) return;
  const rows = big(txt);
  const slam = lt - at < 0.12;
  art(g, x, y, rows, slam ? () => K.flashInk : shaded(shades), 1, { edge: false });
}

function roundA(g, lt, L) {
  const bigOK = L.CH >= 34 && L.W >= 64;
  const pasteRows = clamp(L.CH - (bigOK ? 26 : 19), 3, 8);
  const H = (bigOK ? 8 : 2) + pasteRows + 2 + 1 + 1 + 5 + (L.W >= 108 ? 0 : 2);
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  y = title(g, y, "ROUND A", K.redSh, "let the AI guess", K.body, lt, L, bigOK);
  // the chat bubble with the pasted Excel
  const bw = Math.min(L.W - 4, 88), bx = Math.floor((L.W - bw) / 2);
  const pasted = Math.min(150000, 150000 * easeInOut(prog(lt, 0.3, 2.3)));
  const reading = lt > 2.6;
  const btitle = reading ? `${C(K.violet, "◆")} ${C(K.ink, B("AI"))} ${C(K.mute, `is reading 150,000 rows ${"⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[Math.floor(lt * 12) % 10]}`)}` : `${C(K.pink, "▸")} ${C(K.ink, B("you"))} ${C(K.mute, "paste the whole Excel into the chat")}`;
  g.box(bx, y, bw, pasteRows + 2, { fg: reading ? K.violet : K.line, title: btitle, bg: K.card });
  const off = Math.floor(pasted / 37);
  for (let i = 0; i < pasteRows; i++) {
    const row = POOL[(off + i * 7) % POOL.length].replace(/ · /g, "\t").replace(/\t/g, "  ");
    g.text(bx + 2, y + 1 + i, row, { fg: reading ? K.faint : K.paste(i), max: bw - 4 });
  }
  const tag = ` ${fmt(pasted)} / 150,000 rows pasted `;
  g.text(bx + bw - vis(tag) - 2, y + pasteRows + 1, tag, { fg: K.mute });
  y += pasteRows + 2;
  // tickers: time-compressed timer + cost
  const tk = easeInOut(prog(lt, 0.5, 3.4));
  g.center(y, `${C(K.mute, "time")} ${C(K.ink, B(`${(52 * tk).toFixed(1).padStart(4)} s`))}     ${C(K.mute, "cost")} ${C(K.gold, B(`$${(0.15 * tk).toFixed(3)}`))}     ${C(K.line, "(time-compressed)")}`);
  y += 2;
  // the five confident answers
  const sideScore = L.W >= 108;
  const lw = 2 + 4 + 26 + 16 + 24, lx = Math.floor((L.W - lw - (sideScore ? 30 : 0)) / 2);
  for (let i = 0; i < 5; i++) {
    const at = 3.3 + i * 0.33;
    if (lt < at - 0.2) continue;
    const stamped = lt >= at, flash = stamped && lt - at < 0.14;
    const bg = flash ? K.flashBad : null;
    if (flash) g.rect(lx - 1, y + i, lw + 2, 1, K.flashBad);
    g.text(lx, y + i, stamped ? "✗" : " ", { fg: flash ? K.fgBad : K.red, at: 1, bg });
    g.text(lx + 2, y + i, `q${i + 1}`, { fg: K.mute, bg });
    g.text(lx + 6, y + i, QS[i], { fg: K.body, bg });
    g.text(lx + 32, y + i, GUESS[i][0], { fg: K.ink, at: 1, bg });
    if (stamped) g.text(lx + 48, y + i, GUESS[i][1], { fg: flash ? K.fgBad : K.red2, bg, max: L.W - lx - 49 });
  }
  if (sideScore) {
    scoreBig(g, lx + lw + 6, y - 1, "0/5", K.redSh, lt, 5.0);
    if (lt > 5.15) g.text(lx + lw + 6, y + 5, `$0.15 · 52 s · confidently wrong`, { fg: K.mute });
  } else if (lt > 5.0) {
    g.center(y + 6, `${badge(K.onAccent, K.red, " 0/5 ")}  ${C(K.mute, "$0.15 · 52 s · confidently wrong")}`);
  }
}

// ── scene: round B, let the AI write code ─────────────────────────────────────────────────────────
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

function roundB(g, lt, L) {
  const bigOK = L.CH >= 36 && L.W >= 70;
  const sideScore = L.W >= 100;
  const fixed = (bigOK ? 8 : 2) + 2 + 1 + 2 + 1 + (sideScore ? 6 : 1);
  const codeRows = clamp(L.CH - fixed - 2, 4, 16);
  const H = fixed + codeRows;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  y = title(g, y, "ROUND B", K.greenSh, "let the AI write code", K.body, lt, L, bigOK);
  // code panel
  const pw = Math.min(L.W - 4, 86), px = Math.floor((L.W - pw) / 2);
  const typed = Math.floor(CODE.length * prog(lt, 0.35, 2.8));
  const src = CODE.slice(0, typed).split("\n");
  const first = Math.max(0, src.length - codeRows);
  const writing = typed < CODE.length;
  const cost = 0.014 * prog(lt, 0.35, 2.8);
  g.box(px, y, pw, codeRows + 2, { fg: writing ? K.pink : K.rule, bg: K.card, title: `${C(K.pink, "◆")} ${C(K.ink, B("AI"))} ${C(K.body, writing ? "is writing" : "wrote")} ${C(K.ink, "solve.py")} ${C(K.mute, `· ${src.length} lines · $${cost.toFixed(3)}`)}` });
  for (let i = 0; i < codeRows; i++) {
    const n = first + i;
    if (n >= src.length) break;
    g.text(px + 1, y + 1 + i, `${String(n + 1).padStart(3)} │ `, { fg: K.rule });
    const w = g.text(px + 7, y + 1 + i, hl(src[n]), { fg: K.text, max: pw - 9 });
    if (n === src.length - 1 && writing && Math.floor(lt * 4) % 2 === 0) g.set(px + 7 + w, y + 1 + i, "▌", K.pink);
  }
  y += codeRows + 3;
  // the laptop runs it
  if (lt > 3.25) {
    const cmd = "python3 solve.py";
    g.text(px + 2, y, `${C(K.pink, "$")} ${C(K.ink, B(cmd.slice(0, Math.floor(prog(lt, 3.25, 0.25) * cmd.length))))}`);
    g.text(px + 22, y, "your laptop runs it on 150,000 rows", { fg: K.mute, max: pw - 24 });
    const p = easeInOut(prog(lt, 3.55, 1.0));
    const bw = Math.max(10, Math.min(46, pw - 34));
    const done = p >= 1;
    bar(g, px + 2, y + 1, bw, p, done ? K.green : K.pink);
    g.text(px + 2 + bw, y + 1, `  ${C(K.ink, B(fmt(150000 * p).padStart(7)))} ${C(K.mute, "/ 150,000 rows")}${done ? `  ${C(K.green, B("done"))}` : ""}`);
  }
  y += 3;
  // the test checks it
  const lw = 2 + 4 + 28 + 10, lx = sideScore ? Math.floor((L.W - lw - 30) / 2) : px + 2;
  if (sideScore) {
    for (let i = 0; i < 5; i++) {
      const at = 4.75 + i * 0.2;
      if (lt < at) continue;
      const flash = lt - at < 0.12, bg = flash ? K.flashOk : null;
      if (flash) g.rect(lx - 1, y + i, lw + 2, 1, K.flashOk);
      g.text(lx, y + i, "✓", { fg: flash ? K.fgOk : K.green, at: 1, bg });
      g.text(lx + 2, y + i, `q${i + 1}`, { fg: K.mute, bg });
      g.text(lx + 6, y + i, QS[i], { fg: K.body, bg });
      g.text(lx + 34, y + i, "verified", { fg: flash ? K.fgOk : K.green, bg });
    }
    scoreBig(g, lx + lw + 6, y - 1, "5/5", K.greenSh, lt, 5.9);
    if (lt > 6.05) g.text(lx + lw + 6, y + 5, "$0.014 · checked by a test", { fg: K.mute });
  } else {
    let s = "";
    for (let i = 0; i < 5; i++) s += lt >= 4.75 + i * 0.2 ? `${C(K.green, B("✓"))} ${C(K.mute, `q${i + 1}`)}  ` : "      ";
    if (lt > 5.9) s += ` ${badge(K.onAccent, K.green, " 5/5 ")} ${C(K.body, "$0.014")}`;
    g.text(px + 2, y, s);
  }
}

// ── scene: the bill (two receipts) ────────────────────────────────────────────────────────────────
// Illustrative token counts at one flat rate ($1/M in, $5/M thinking+out); amounts in mills (1/1000 $).
const BILL = [
  { name: "ROUND A", how: "paste & guess", items: [["input · Excel", 100000, 100], ["thinking tokens", 8000, 40], ["output tokens", 2000, 10]], score: "0/5", ok: false },
  { name: "ROUND B", how: "write code, run it", items: [["input · task.md", 4000, 4], ["thinking tokens", 1200, 6], ["output · solve.py", 800, 4], ["laptop · 150,000 rows", 0, 0]], score: "5/5", ok: true },
];
const millsOf = (b) => b.items.reduce((s, it) => s + it[2], 0);
const usd = (m) => `$${(m / 1000).toFixed(3)}`;
const CHEAPER = Math.round(millsOf(BILL[0]) / millsOf(BILL[1])); // 150 / 14 → 11
const RW = 30, PW = RW + 4;
function receiptLines(b) {
  const lr = (l, r) => l + " ".repeat(Math.max(1, RW - vis(l) - vis(r))) + r;
  const mid = (s) => " ".repeat(Math.max(0, Math.floor((RW - vis(s)) / 2))) + s;
  const dash = C(P.rule, "- ".repeat(RW / 2).trimEnd());
  const bc = Array.from({ length: RW - 6 }, (_, i) => "▌│▍║▏┃"[hash(i * 7 + b.name.length) % 6]).join("");
  return [
    mid(`${C(P.ink, B(b.name))} ${C(P.mute, "·")} ${C(P.rasp, b.how)}`),
    mid(C(P.mute, "14.10.2026 · 12:00 · Room 2")),
    dash,
    ...b.items.map(([l, tok, m]) => lr(C(P.ink, l), `${C(P.mute, tok ? fmt(tok) : "")}  ${C(P.ink, usd(m))}`)),
    dash,
    lr(C(P.ink, B("TOTAL")), C(P.ink, B(usd(millsOf(b))))),
    lr(C(P.mute, "answers correct"), C(b.ok ? P.green : P.red, B(b.score))),
    "",
    mid(C(P.mute, bc)),
  ];
}
const RECEIPTS = BILL.map(receiptLines);
function receipt(g, x, y, lines, n) {
  g.text(x - 1, y - 1, "▄".repeat(PW + 2), { fg: K.soft }); // the printer slot
  const shown = Math.min(lines.length, Math.floor(n));
  for (let i = 0; i < shown; i++) {
    g.rect(x, y + i, PW, 1, K.paper);
    g.set(x + PW, y + i + 1, " ", K.text, K.shadow);
    g.text(x + 2, y + i, lines[i], { fg: P.ink, max: RW });
    if (i === shown - 1 && n < lines.length) g.set(x + 1, y + i, "▸", P.rasp);
  }
  // torn edge
  for (let i = 0; i < PW; i++) g.set(x + i, y + shown, i % 2 ? " " : "▀", K.paper);
  return y + shown + 1;
}
function stamp(g, x, y, lt, at, compact) {
  if (lt < at) return;
  const slam = lt - at < 0.14;
  const fgc = slam ? K.onAccent : K.pink, bgc = slam ? K.pink : K.card;
  if (compact) {
    const s = `  ${CHEAPER}× CHEAPER  `;
    g.box(x, y, vis(s) + 2, 3, { fg: K.pink, bg: bgc, dbl: true });
    g.text(x + 1, y + 1, s, { fg: fgc, bg: bgc, at: 1 });
    return;
  }
  const rows = big(`${CHEAPER}X`), w = bigW(rows) + 6;
  g.box(x, y, w, 10, { fg: K.pink, bg: bgc, dbl: true });
  art(g, x + 3, y + 1, rows, (ch) => (slam ? fgc : SHADOW.has(ch) ? K.rasp : K.pink), 1, { edge: false });
  const s = spaced("CHEAPER");
  g.text(x + Math.floor((w - s.length) / 2), y + 8, s, { fg: fgc, at: 1 });
}
function bill(g, lt, L) {
  const recH = Math.max(...RECEIPTS.map((r) => r.length)) + 1;
  const wide = L.W >= PW * 2 + 6 + 30 && L.CH >= recH + 7;
  const two = L.W >= PW * 2 + 6 && L.CH >= recH + 5;
  const H = 3 + 1 + recH + 2;
  let y = Math.max(0, Math.floor((L.CH - H) / 2));
  typeTitle(g, y, L.W >= 40 ? spaced("THE BILL") : "THE BILL", lt);
  if (lt > 0.4) g.center(y + 1, `${C(K.mute, "same five questions ·")} ${C(K.body, "two ways to pay")}`);
  y += 4;
  const nA = prog(lt, 0.3, 1.4) * (RECEIPTS[0].length + 0.99), nB = prog(lt, 0.9, 1.5) * (RECEIPTS[1].length + 0.99);
  if (wide || two) {
    const sw = wide ? bigW(big(`${CHEAPER}X`)) + 6 : 0;
    const total = PW * 2 + 6 + (wide ? sw + 6 : 0);
    const x0 = Math.floor((L.W - total) / 2);
    receipt(g, x0, y, RECEIPTS[0], nA);
    receipt(g, x0 + PW + 6, y, RECEIPTS[1], nB);
    if (wide) stamp(g, x0 + PW * 2 + 12, y + Math.floor((recH - 10) / 2), lt, 2.75, false);
    else stamp(g, Math.floor((L.W - 19) / 2), y + recH - 3, lt, 2.75, true);
    if (lt > 3.2 && L.CH > y + recH + 1) {
      const s = "same AI · it wrote code instead of reading rows";
      g.center(y + recH + 1, s.slice(0, Math.floor(prog(lt, 3.2, 0.5) * s.length)).padEnd(s.length), { fg: K.body });
    }
    if (L.CH > y + recH + 3 && lt > 3.4) g.center(y + recH + 3, "illustrative token counts · $1/M in · $5/M thinking + out", { fg: K.line });
  } else {
    BILL.forEach((b, i) => {
      if (lt < 0.4 + i * 0.6) return;
      g.center(y + i * 2, `${C(K.ink, B(b.name))} ${C(K.mute, b.how.padEnd(18))} ${C(K.ink, B(usd(millsOf(b))))}  ${C(b.ok ? K.green : K.red, B(b.score))}`);
    });
    stamp(g, Math.floor((L.W - 19) / 2), y + 5, lt, 2.2, true);
  }
}

// ── scene: the motto + countdown ──────────────────────────────────────────────────────────────────
const MOTTO = [["AI WRITES.", K.aiSh, "AI writes."], ["CODE RUNS.", K.codeSh, "Code runs."], ["AI CHECKS.", K.greenSh, "AI checks."]];
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
    g.center(y, MOTTO.map(([, sh, s], k) => C(k <= i ? sh[1] : K.faint, B(s))).join("  "));
    y += 2;
  } else {
    MOTTO.forEach(([, sh, s], k) => { if (lt > k * 0.6) g.center(y + k, s, { fg: sh[1], at: 1 }); });
    y += 4;
  }
  if (lt > 2.1) {
    const s = "The lazy genius lab · 12:00 · Room 2";
    g.center(y, s.slice(0, Math.floor(prog(lt, 2.1, 0.6) * s.length)).padEnd(s.length), { fg: K.ink, at: 1 });
  }
  if (lt > 2.7) g.center(y + 2, `${C(K.pink, "▸")} ${C(K.body, "get your sheet, open a terminal")}`);
  y += 4;
  if (cd && lt > 3.1) g.center(y, badge(231, K.rasp, `  STARTS IN  ${cd}  `));
  if (L.CH >= 40 && lt > 3.3) g.center(y + (cd ? 3 : 1), "OpenSlava 2026 · 14 Oct · 12:00–14:30 · Jakub Novak, msg life Slovakia · workshop partner ElevenLabs", { fg: K.quiet, max: L.W - 2 });
}

// ── scene: scan to rate (the living QR, kept scannable: white quiet zone + white light modules) ───
const QN = QR.length, QW = QN + 8, QH = Math.ceil(QW / 2);
const QR_SHORT = QR_URL.replace(/^https?:\/\//, "");
function drawQR(g, x0, y0, t, p) {
  const col = (x, y) => {
    const mx = x - 4, my = y - 4;
    const dark = mx >= 0 && my >= 0 && mx < QN && my < QN && QR[my][mx] === "1" && h01(mx * 131 + my * 7919) <= p;
    return dark ? darkColor(mx, my, t, QN) : QR_LIGHT;
  };
  for (let y = 0; y < QW; y += 2) for (let x = 0; x < QW; x++) g.set(x0 + x, y0 + y / 2, "▀", col(x, y), y + 1 < QW ? col(x, y + 1) : QR_LIGHT);
}
function qrScene(g, lt, L) {
  const p = easeOut(prog(lt, 0.15, 0.9));
  const side = L.W >= QW + 33 && L.CH >= QH;
  const stack = !side && L.W >= QW + 2 && L.CH >= QH + 4;
  const lines = [
    [spaced("SCAN TO RATE"), K.ink, 1],
    ["the workshop · later", K.pink, 1],
    ["", 0, 0],
    ["after the lab · takes 1 minute", K.body, 0],
    ["your phone camera is enough", K.mute, 0],
    ["", 0, 0],
    [QR_SHORT, K.violet, 0],
  ];
  const typeLine = (x, y, [s, fg, at], i) => { if (s) g.text(x, y, s.slice(0, Math.floor(prog(lt, 0.3 + i * 0.12, 0.4) * s.length)), { fg, at }); };
  let qx, qy;
  if (side) {
    const total = QW + 3 + 30;
    qx = Math.floor((L.W - total) / 2); qy = Math.floor((L.CH - QH) / 2);
    const tx = qx + QW + 3, ty = qy + Math.floor((QH - lines.length) / 2);
    lines.forEach((l, i) => typeLine(tx, ty + i, l, i));
  } else if (stack) {
    qx = Math.floor((L.W - QW) / 2); qy = Math.max(2, Math.floor((L.CH - QH - 3) / 2) + 2);
    g.center(qy - 2, `${C(K.ink, B(L.W >= 40 ? spaced("SCAN TO RATE") : "SCAN TO RATE"))}  ${C(K.pink, B("the workshop · later"))}`);
    if (qy + QH < L.CH) g.center(qy + QH, `${C(K.mute, "after the lab ·")} ${C(K.violet, QR_SHORT)}`);
  } else {
    const y = Math.floor(L.CH / 2) - 2;
    lines.filter(([s]) => s).forEach((l, i) => { const [s, fg, at] = l; g.center(y + i, s.slice(0, Math.floor(prog(lt, 0.3 + i * 0.12, 0.4) * s.length)).padEnd(s.length), { fg, at }); });
    return;
  }
  drawQR(g, qx, qy, lt, p);
  // raspberry corner brackets that close in on the code (outside the quiet zone)
  const o = 1 + Math.round(3 * (1 - easeOut(prog(lt, 0.1, 0.7))));
  const x1 = qx - 1 - o, x2 = qx + QW + o, y1 = qy - 1 - Math.floor(o / 2), y2 = qy + QH + Math.floor(o / 2);
  if (y1 >= 0 && y2 < L.CH && x1 >= 0 && x2 < L.W) {
    [[x1, y1, "┏", 1, 1], [x2, y1, "┓", -1, 1], [x1, y2, "┗", 1, -1], [x2, y2, "┛", -1, -1]].forEach(([x, y, c, dx]) => {
      g.set(x, y, c, K.pink); g.set(x + dx, y, "━", K.pink); g.set(x + 2 * dx, y, "━", K.pink);
    });
  }
}

// ── scene list + transitions ──────────────────────────────────────────────────────────────────────
// tr = how this scene comes in: [kind, seconds]. A scene starts drawing tr seconds before its slot.
const SCENES = [
  { fn: logos, dur: 4.5, tr: ["dissolve", 0.7] },
  { fn: rain, dur: 5.5, tr: ["diag", 0.55] },
  { fn: race, dur: 4, tr: ["blindsV", 0.6] },
  { fn: roundA, dur: 6, tr: ["glitch", 0.5] },
  { fn: roundB, dur: 6.5, tr: ["blindsH", 0.6] },
  { fn: bill, dur: 4.5, tr: ["diagR", 0.5] },
  { fn: finale, dur: 5.5, tr: ["ring", 0.7] },
  { fn: qrScene, dur: 3.5, tr: ["glitch", 0.45] },
];
let LOOP = 0;
for (const s of SCENES) { s.start = LOOP; LOOP += s.dur; }

// Composite two finished frames: out (A) -> in (Bn) at progress p (0..1).
function transition(A, Bn, p, kind) {
  const W = A.w, H = A.h, R = new Grid(W, H);
  const e = easeInOut(clamp(p));
  const take = (i, s, j = i) => { R.ch[i] = s.ch[j]; R.fg[i] = s.fg[j]; R.bg[i] = s.bg[j]; R.at[i] = s.at[j]; };
  const paint = (i, ch, fg, bg) => { R.ch[i] = ch; R.fg[i] = fg; R.bg[i] = bg; R.at[i] = 0; };
  const cx = (W - 1) / 2, cy = (H - 1) / 2, maxD = Math.hypot(W / 2 / 2.1, H / 2);
  const step = Math.floor(e * 14);
  for (let y = 0; y < H; y++) {
    // glitch: per-row choice, tear offset, scan line
    let rowIn = false, off = 0;
    if (kind === "glitch") {
      rowIn = h01(y * 131 + step * 977) < e * 1.1 - 0.05;
      if (hash(y * 7 + step * 13) % 3 === 0) off = Math.round((h01(y * 17 + step * 31) - 0.5) * 12 * Math.sin(Math.PI * e));
    }
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      switch (kind) {
        case "diag": case "diagR": {
          const band = 7, v = (kind === "diag" ? x : W - 1 - x) + y * 2.2, d = e * (W + H * 2.2 + band) - v;
          if (d >= band) take(i, Bn);
          else if (d > 0) {
            const k = d / band;
            if (k < 0.3) paint(i, " ", K.pink, K.pink);
            else if (k < 0.6) paint(i, "╱", K.pink, K.rasp);
            else { take(i, Bn); R.bg[i] = dim(K.rasp, ((1 - k) / 0.4) * 0.55); }
          } else take(i, A);
          break;
        }
        case "dissolve": {
          const r = h01(x * 7919 + y * 104729);
          if (r < e - 0.07) take(i, Bn);
          else if (r < e) paint(i, "░▒▓█"[Math.floor(((e - r) / 0.07) * 4) % 4], hash(i) & 1 ? K.pink : K.violet, Bn.bg[i]);
          else take(i, A);
          break;
        }
        case "blindsV": case "blindsH": {
          const vert = kind === "blindsV", sz = vert ? 6 : 3, pos = vert ? x : y, len = vert ? W : H;
          const slat = Math.floor(pos / sz), n = Math.ceil(len / sz);
          const local = clamp(e * 1.6 - (slat / n) * 0.6), edge = Math.floor(local * sz), c = pos % sz;
          if (c < edge) take(i, Bn);
          else if (c === edge && local > 0 && local < 1) paint(i, vert ? "▌" : "▀", K.violet, A.bg[i]);
          else take(i, A);
          break;
        }
        case "ring": {
          const R0 = e * (maxD + 4), d = Math.hypot((x - cx) / 2.1, y - cy);
          if (d < R0 - 2) { take(i, Bn); if (R0 > 7 && Math.abs(d - (R0 - 5)) < 0.35 && (R.ch[i] === " " || Bn.amb[i])) { R.ch[i] = "·"; R.fg[i] = K.pink; } }
          else if (d < R0 - 0.8) paint(i, " ", K.pink, K.pink);
          else if (d < R0) paint(i, " ", K.rasp, K.rasp);
          else take(i, A);
          break;
        }
        case "glitch": {
          const sx = clamp(x - off, 0, W - 1);
          take(i, rowIn ? Bn : A, y * W + sx);
          if (off && R.ch[i] !== " ") R.fg[i] = off > 0 ? K.pink : K.violet;
          break;
        }
        default: take(i, e < 0.5 ? A : Bn);
      }
    }
    if (kind === "glitch") {
      const sy = Math.floor(e * (H + 2)) - 1;
      if (y === sy) for (let x = 0; x < W; x++) paint(y * W + x, " ", K.pink, K.pink);
      else if (y === sy - 1) for (let x = 0; x < W; x++) R.bg[y * W + x] = dim(K.pink, 0.35);
    }
  }
  return R;
}

// ── footer + composition ──────────────────────────────────────────────────────────────────────────
function footer(g, si) {
  const y = g.h - 1;
  const left = `${C(K.rasp, "●")}${C(K.sub, B("msg"))} ${C(K.line, "×")} ${C(K.text, B("OPEN"))}${C(K.sub, "SLAVA")} ${C(K.line, "'26")}`;
  const cd = countdown();
  const right = `${C(K.mute, "The lazy genius lab · 12:00 · Room 2")}${cd ? `${C(K.line, " · in ")}${C(K.text, cd)}` : ""}`;
  const rshort = `${C(K.mute, "12:00 · Room 2")}${cd ? `${C(K.line, " · in ")}${C(K.text, cd)}` : ""}`;
  const dots = SCENES.map((_, i) => (i === si ? C(K.pink, "●") : C(K.faint, "·"))).join(" ");
  g.text(1, y, left);
  const lEnd = 1 + vis(left), dw = vis(dots), dx = Math.floor((g.w - dw) / 2);
  const fits = (r) => g.w - vis(r) - 2 > lEnd + 2;
  const r = fits(right) && g.w - vis(right) - 2 > dx + dw + 2 ? right : rshort;
  if (fits(r)) g.text(g.w - vis(r) - 2, y, r);
  if (dx > lEnd + 2 && dx + dw + 2 < g.w - vis(r) - 2) g.center(y, dots);
}
function render(t, W, H) {
  const L = { W, H, CH: Math.max(1, H - 1) };
  let si = 0;
  for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].start) si = i;
  const cur = SCENES[si], ni = (si + 1) % SCENES.length, nxt = SCENES[ni];
  const end = cur.start + cur.dur, d = nxt.tr[1];
  const draw = (s, lt) => { const g = new Grid(W, H); ambient(g, t); s.fn(g, lt, L); return g; };
  const lt = t - cur.start + cur.tr[1];
  let g = null, dot = si;
  if (t >= end - d) {
    const p = (t - (end - d)) / d;
    g = transition(draw(cur, lt), draw(nxt, t - (end - d)), p, nxt.tr[0]);
    if (p >= 0.5) dot = ni;
  } else g = draw(cur, lt);
  if (H >= 8) footer(g, dot);
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
    "    Who reads the rows?  the AI stops at ~3 % (context full); a for-loop reads all of them in 0.4 s",
    "    Round A  paste it into an AI, let it guess          0/5 · $0.15 · 52 s",
    "    Round B  the AI writes code, your laptop runs it    5/5 · $0.014",
    `    The bill: ${CHEAPER}× cheaper, and right.`,
    "",
    "  AI writes. Code runs. AI checks.",
    `  Get your sheet, open a terminal.${cd ? `  Starts in ${cd}.` : ""}`,
    `  Rate the workshop later: ${QR_URL}`,
    "",
  ].join("\n") + "\n");
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
const SECONDS = Number(opt("--seconds")) || (ONCE ? LOOP : Infinity);
if (FRAME !== undefined) {
  const [w, h] = (SIZE ?? "80x24").split("x").map(Number);
  const g = render(clamp(Number(FRAME), 0, LOOP - 0.001), w, h);
  process.stdout.write((argv.includes("--ansi") ? g.ansi().replace(/\x1b\[\?2026[hl]/g, "") : g.plain()) + "\n");
} else if (!isTTY || ASCII) {
  staticText();
} else {
  const out = process.stdout;
  let restored = false, needClear = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
    out.write("\x1b[?2026l\x1b[0m\x1b[2J\x1b[H\x1b[?25h\x1b[?1049l");
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

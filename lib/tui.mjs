// Zero-dependency terminal theatre: logos, banner, steps, spinners, live panels, boxes.
//
// Fallbacks, all decided here:
//   not a TTY or NO_COLOR set  -> plain text: no escape codes, no animation (isTTY = false)
//   LAB_ASCII=1 (or --ascii)   -> every Unicode glyph is swapped for ASCII (see ASCII_MAP), banner and
//                                 logos become plain bold text. Auto-on for the legacy Windows console.
import { paint, logoSize, to256, CARD_BG } from "./logos.mjs";

export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
// LAB_ASCII=1 forces ASCII, LAB_ASCII=0 forces Unicode; otherwise ASCII only on the legacy Windows console.
const E = process.env;
const legacyWinConsole = process.platform === "win32" && !E.WT_SESSION && !E.TERM_PROGRAM && !E.TERM && !E.ConEmuANSI && !E.TERMINAL_EMULATOR;
export const ASCII = E.LAB_ASCII === "1" || process.argv.includes("--ascii") || (E.LAB_ASCII !== "0" && legacyWinConsole);
if (process.argv.includes("--ascii")) process.argv.splice(process.argv.indexOf("--ascii"), 1);

// ── glyphs ────────────────────────────────────────────────────────────────────────────────────────
// One table. Every string that reaches stdout goes through tr() in ASCII mode (see the write hook below),
// so scripts can use the Unicode glyphs freely. Widths are measured after translation (vis/fit).
const ASCII_MAP = {
  "✓": "OK", "✗": "x", "·": "|", "×": "x", "→": "->", "▸": ">", "◆": "*", "●": ".", "…": "...", "▌": "|",
  "╭": "+", "╮": "+", "╰": "+", "╯": "+", "─": "-", "│": "|", "├": "+", "┤": "+", "┼": "+", "┬": "+", "┴": "+",
  "█": "#", "░": ".", "▀": "\"", "▄": "_", "═": "=", "║": "|", "╔": "+", "╗": "+", "╚": "+", "╝": "+",
  "▁": "_", "▂": ".", "▃": ",", "▅": "~", "▆": "=", "▇": "*",
  "⠋": "|", "⠙": "/", "⠹": "-", "⠸": "\\", "⠼": "|", "⠴": "/", "⠦": "-", "⠧": "\\", "⠇": "|", "⠏": "/",
  "‘": "'", "’": "'", "“": "\"", "”": "\"", "–": "-", "—": "-",
  "✅": "[OK]", "❌": "[X]", "🧠": "",
};
const ASCII_RE = new RegExp(Object.keys(ASCII_MAP).map((k) => k.replace(/[\\^$.*+?()[\]{}|-]/g, "\\$&")).join("|"), "gu");
export const tr = (s) => (ASCII ? s.replace(ASCII_RE, (ch) => ASCII_MAP[ch]) : s);
if (ASCII) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => write(typeof chunk === "string" ? tr(chunk) : chunk, ...rest);
}
export const G = {
  ok: "✓", bad: "✗", dot: "·", step: "▸", diamond: "◆", ell: "…", times: "×", arrow: "→",
  spin: ASCII ? ["|", "/", "-", "\\"] : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  bars: ASCII ? "_.,-~=*#" : "▁▂▃▄▅▆▇█",
};
export const SPIN = G.spin;
export const spin = (f) => G.spin[f % G.spin.length];

// ── colors ────────────────────────────────────────────────────────────────────────────────────────
const esc = (code) => (isTTY ? `\x1b[${code}m` : "");
export const fg = (n) => esc(`38;5;${n}`);
export const c = {
  reset: esc(0), bold: esc(1), dim: esc(2), italic: esc(3),
  pink: esc("38;5;161"), rasp: esc("38;5;125"), red: esc("38;5;203"), green: esc("38;5;42"), yellow: esc("38;5;221"),
  grey: esc("38;5;245"), white: esc("38;5;255"), violet: esc("38;5;141"),
  okBadge: esc("1;38;5;16;48;5;42"), warnBadge: esc("1;38;5;16;48;5;221"), badBadge: esc("1;38;5;16;48;5;203"),
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (s) => process.stdout.write(s);
export { out };
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const vis = (s) => [...tr(s.replace(ANSI, ""))].length;
export const cols = () => process.stdout.columns || 80;
export const panelWidth = () => Math.max(40, Math.min(cols() - 4, 96));

if (isTTY) {
  out("\x1b[?25l");
  const restore = () => out("\x1b[?25h\x1b[0m");
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
}

// Cut a string with ANSI colors to n visible characters (a wrapped live line can't be redrawn).
export function fit(s, n) {
  s = tr(s);
  let v = 0, o = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\x1b") { const m = s.slice(i).match(/^\x1b\[[0-9;?]*[A-Za-z]/); if (m) { o += m[0]; i += m[0].length - 1; continue; } }
    if (v >= n) break;
    const cp = s.codePointAt(i);
    if (cp > 0xffff) i++;
    o += String.fromCodePoint(cp); v++;
  }
  return o + (isTTY ? "\x1b[0m" : "");
}
const fitPad = (s, n) => { const f = fit(s, n); return f + " ".repeat(Math.max(0, n - vis(f))); };
export const clip = (s, n) => (s.length > n ? "…" + s.slice(s.length - n + 1) : s);

// Word-wrap plain text to width n (keeps paragraph breaks, hard-breaks long words).
export function wrap(text, n) {
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > n) { if (line) { lines.push(line); line = ""; } lines.push(word.slice(0, n)); word = word.slice(n); }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= n) line += " " + word;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

// ── brand ─────────────────────────────────────────────────────────────────────────────────────────
// One line for every script except start: ●msg × OPENSLAVA '26 · <what this script is>
// Same brand header in every script: the real logos (fast), then what this script is.
export async function brandLine(sub = "the lazy genius lab") {
  await intro({ delay: 7 });
  out(`  ${c.grey}${sub}${c.reset}\n`);
}

// Brand intro for start.mjs: the real logos as half-block art (lib/logo-art.mjs, built by admin/ascii-logos.cjs).
// Rows fade in from dark to the brand colour. Plain one-liner when not a TTY, ASCII mode, or a narrow terminal.
export async function intro({ delay = 35 } = {}) {
  const { ART } = await import("./logo-art.mjs");
  const wide = Math.max(...ART.elevenlabs.map((l) => l.length), ART.open[0].length + ART.slava[0].length + ART.n26[0].length + 2);
  if (!isTTY || ASCII || cols() < wide + 6) {
    out(`\n  ${c.rasp}●${c.reset}${c.bold}msg${c.reset} × ${c.bold}OPEN${c.reset}SLAVA '26 ${c.grey}· workshop partner${c.reset} ${c.bold}ElevenLabs${c.reset}\n`);
    return;
  }
  const RAMP = (to) => [236, 238, 240, 242, to];             // dark → final colour
  const paintLine = (s, base, tone) => s.replace(/\{([^}]*)\}/g, (_, x) => `\x1b[38;5;${tone(125)}m${x}\x1b[38;5;${tone(base)}m`);
  const rows = [];
  ART.msg.forEach((l) => rows.push((t) => `\x1b[38;5;${t(250)}m${paintLine(l, 250, t)}\x1b[0m`));
  rows.push(() => "");
  for (let i = 0; i < ART.open.length; i++)
    rows.push((t) => `\x1b[38;5;${t(255)}m${ART.open[i]} \x1b[38;5;${t(245)}m${ART.slava[i]} \x1b[38;5;${t(255)}m${ART.n26[i]}\x1b[0m`);
  rows.push((t) => `\x1b[38;5;${t(244)}mworkshop partner\x1b[0m`);
  ART.elevenlabs.forEach((l) => rows.push((t) => `\x1b[38;5;${t(255)}m${l}\x1b[0m`));
  out("\n");
  // reveal: each row fades in through the ramp, rows staggered by one step
  const steps = 5, frames = rows.length + steps;
  for (let f = 0; f < frames; f++) {
    if (f) out(`\x1b[${rows.length}A`);
    rows.forEach((r, i) => {
      const k = f - i;
      out(`\r\x1b[2K  ${k < 0 ? "" : r((to) => RAMP(to)[Math.min(k, steps - 1)])}\n`);
    });
    await sleep(delay);
  }
}

const GLYPHS = {
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
  D: ["██████╗ ", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝ "],
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  Y: ["██╗   ██╗", "╚██╗ ██╔╝", " ╚████╔╝ ", "  ╚██╔╝  ", "   ██║   ", "   ╚═╝   "],
  " ": ["   ", "   ", "   ", "   ", "   ", "   "],
};
const SHADES = [161, 162, 163, 164, 135, 141];

export async function banner(word, subtitle) {
  out("\n");
  if (ASCII) { out(`  ${c.pink}${c.bold}${[...word].join(" ")}${c.reset}\n`); if (subtitle) out(`  ${c.grey}${subtitle}${c.reset}\n`); return out("\n"); }
  for (let row = 0; row < 6; row++) {
    const line = [...word].map((ch) => GLYPHS[ch][row]).join("");
    out(`  ${esc(`38;5;${SHADES[row]}`)}${c.bold}${line}${c.reset}\n`);
    if (isTTY) await sleep(55);
  }
  if (subtitle) out(`  ${c.grey}${subtitle}${c.reset}\n`);
  out("\n");
}

export const step = (label) => out(`  ${c.pink}▸${c.reset} ${c.bold}${label}${c.reset}\n`);
export const note = (label) => out(`    ${c.grey}${label}${c.reset}\n`);
export const cmd = (s) => `${c.pink}$${c.reset} ${c.white}${c.bold}${s}${c.reset}`;

// "  label ...⠹" while fn runs, then "  ✓ label  detail" / "  ✗ label  detail". fn returns [ok, detail].
export async function checkLine(label, fn, minMs = 350) {
  let f = 0;
  const id = isTTY ? setInterval(() => out(`\r\x1b[2K${fit(`    ${c.pink}${spin(f++)}${c.reset} ${label}`, cols() - 1)}`), 70) : null;
  const t = Date.now();
  let res;
  try { res = await fn(); } catch (e) { res = [false, errText(e)]; }
  if (isTTY) { await sleep(Math.max(0, minMs - (Date.now() - t))); clearInterval(id); }
  const [ok, detail = ""] = res;
  out(`${isTTY ? "\r\x1b[2K" : ""}    ${mark(ok)} ${label}${detail ? `  ${ok === false ? c.red : c.grey}${detail}${c.reset}` : ""}\n`);
  return ok;
}
// "fetch failed" alone is useless: name the cause, and spot corporate TLS proxies.
export function errText(e) {
  const code = e?.cause?.code ?? e?.code;
  if (/CERT|SELF_SIGNED/.test(String(code))) return `corporate TLS proxy (${code}). Run: $env:NODE_OPTIONS="--use-system-ca"; node start.mjs`;
  return `${e?.cause?.message && e.message === "fetch failed" ? `fetch failed: ${e.cause.message}` : e?.message ?? e}${code ? ` (${code})` : ""}`;
}
export const mark = (ok) => (ok === null ? `${c.grey}·${c.reset}` : ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`);

// Random characters settling into the final text, left to right.
export async function decode(text, color = c.white) {
  if (!isTTY) return out(`    ${text}\n`);
  const pool = "ABCDEFGHJKMNPQRSTUVWXYZ23456789#%&@";
  for (let i = 0; i <= text.length; i += 1) {
    for (let k = 0; k < 2; k++) {
      const tail = [...text.slice(i)].map((ch) => (ch === "-" ? "-" : pool[Math.floor(Math.random() * pool.length)])).join("");
      out(`\r\x1b[2K    ${color}${c.bold}${text.slice(0, i)}${c.reset}${c.grey}${tail}${c.reset}`);
      await sleep(22);
    }
  }
  out("\n");
}

// ── boxes ─────────────────────────────────────────────────────────────────────────────────────────
// Framed lines. title sits in the top border; foot (e.g. a wave) in the bottom border on the right.
export function frame(lines, { width, color = c.pink, title = "", foot = "" } = {}) {
  const W = width ?? Math.max(...lines.map(vis), vis(title) + 2) + 6;
  const t = title ? fit(title, W - 8) : "";
  const top = t ? `${color}╭─${c.reset} ${t} ${color}${"─".repeat(Math.max(0, W - 5 - vis(t)))}╮${c.reset}` : `${color}╭${"─".repeat(W - 2)}╮${c.reset}`;
  const bot = foot ? `${color}╰${"─".repeat(Math.max(0, W - 5 - vis(foot)))}${c.reset} ${foot} ${color}─╯${c.reset}` : `${color}╰${"─".repeat(W - 2)}╯${c.reset}`;
  return [top, ...lines.map((l) => `${color}│${c.reset} ${fitPad(l, W - 4)} ${color}│${c.reset}`), bot].map((l) => `  ${l}`);
}

export function box(lines, color = c.pink, title = "") {
  const L = ["", ...lines.map((l) => (l ? ` ${l}` : l)), ""];
  const W = Math.max(Math.max(...L.map(vis)) + 2, vis(title) + 6) + 4;
  out("\n" + frame(L, { width: W, color, title }).join("\n") + "\n\n");
}

// The "what now" box every script ends with. Use cmd("node x.mjs") for the commands.
export const nextBox = (lines, color = c.pink) => box(lines, color, `${c.bold}NEXT${c.reset}`);

export function scoreBox({ score, total = 5, cost, seconds, round }) {
  const color = score === total ? c.green : score >= 3 ? c.yellow : c.red;
  const parts = [`${c.grey}SCORE${c.reset}  ${color}${c.bold}${score}/${total}${c.reset}`];
  if (cost !== undefined) parts.push(`${c.grey}COST${c.reset}  ${c.white}${c.bold}$${cost.toFixed(4)}${c.reset}`);
  if (seconds !== undefined) parts.push(`${c.grey}TIME${c.reset}  ${c.white}${c.bold}${seconds.toFixed(1)}s${c.reset}`);
  const lines = [parts.join("      ")];
  if (round) lines.push(`${c.grey}Write it on your sheet → Round ${round} column.${c.reset}`);
  else if (score === total) lines.push(`${c.green}lazy genius certified${c.reset}`);
  box(lines, color, `${c.bold}RESULT${c.reset}`);
}

// ── live regions ──────────────────────────────────────────────────────────────────────────────────
// A block of lines redrawn in place (cursor up N, clear, redraw), robust-ish to terminal resizes.
export function region() {
  let drawn = 0, drawnW = 0;
  const up = () => (drawn ? drawn * Math.max(1, Math.ceil(drawnW / cols())) : 0);
  return {
    draw(lines) {
      const n = cols() - 1;
      let s = "\x1b[?2026h" + (drawn ? `\x1b[${up()}A` : "") + "\r";
      for (const l of lines) s += "\x1b[2K" + fit(l, n) + "\n";
      out(s + "\x1b[0J\x1b[?2026l");
      drawn = lines.length;
      drawnW = Math.min(n, Math.max(0, ...lines.map(vis)));
    },
    clear() { if (drawn) out(`\x1b[${up()}A\r\x1b[0J`); drawn = 0; },
  };
}

// A live status line redrawn ~12×/s until stop(). render() returns the text.
export function live(render) {
  if (!isTTY) return { stop: (final) => final && out(final + "\n") };
  let f = 0;
  const id = setInterval(() => out(`\r\x1b[2K${fit(render(f++), cols() - 1)}`), 80);
  return { stop: (final) => { clearInterval(id); out(`\r\x1b[2K${final ?? ""}\n`); } };
}

export function wave(frame, intensity = 1) {
  let s = "";
  for (let i = 0; i < 12; i++) s += G.bars[Math.min(7, Math.max(0, Math.round((Math.sin((frame + i * 1.7) / 2.2) + 1) * 3.5 * intensity)))];
  return s;
}

// One labelled bar that fills to `frac` (0..1): "  name  ████░░░░  detail"
export async function bar(label, frac, detail = "", ms = 300) {
  const w = 24, steps = isTTY ? 12 : 1;
  for (let i = 1; i <= steps; i++) {
    const fill = Math.max(frac > 0 ? 1 : 0, Math.round(w * frac * (i / steps)));
    const line = `    ${c.white}${label}${c.reset}  ${c.pink}${"█".repeat(fill)}${c.grey}${"░".repeat(w - fill)}${c.reset}  ${c.white}${detail}${c.reset}`;
    if (isTTY) { out(`\r\x1b[2K${fit(line, cols() - 1)}`); await sleep(ms / steps); } else out(line);
  }
  out("\n");
}

export async function progress(label, total, { ms = 1600, unit = "rows", extra = "" } = {}) {
  const w = 28;
  const steps = isTTY ? 40 : 1;
  for (let i = 1; i <= steps; i++) {
    const n = Math.round((total * i) / steps);
    const fill = Math.round((w * i) / steps);
    const bar = `${c.pink}${"█".repeat(fill)}${c.grey}${"░".repeat(w - fill)}${c.reset}`;
    const line = `    ${bar}  ${c.white}${n.toLocaleString("en")}${c.grey} / ${total.toLocaleString("en")} ${unit}${extra ? "  " + extra : ""}${c.reset}`;
    if (isTTY) { out(`\r\x1b[2K${line}`); await sleep(ms / steps); } else out(line);
  }
  out("\n");
  if (label) note(label);
}

// ── python highlighting (tiny, line-based) ────────────────────────────────────────────────────────
const KW = new Set("def for if elif else return import from with in not and or while try except finally as class lambda yield pass break continue raise is None True False global del assert".split(" "));
const BUILTIN = new Set("len sum open print range int float str dict list set tuple sorted min max abs round enumerate zip map filter any all isinstance divmod reversed".split(" "));
export function highlightPy(line) {
  if (!isTTY) return line;
  return line.replace(/(#.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g, (m, com, str, num, id) => {
    if (com) return `${c.grey}${c.italic}${com}${c.reset}`;
    if (str) return `${c.green}${str}${c.reset}`;
    if (num) return `${c.yellow}${num}${c.reset}`;
    if (KW.has(id)) return `${c.pink}${id}${c.reset}`;
    if (BUILTIN.has(id)) return `${c.violet}${id}${c.reset}`;
    return m;
  });
}
export const stripFences = (s) => s.replace(/^\s*```[a-zA-Z]*\s*\n?/, "").replace(/\n?```[\s\S]*$/, "");

// ── the thinking panel ────────────────────────────────────────────────────────────────────────────
// Live, framed view of a streaming model: feed rows (before anything arrives) -> reasoning -> answer.
//   stats() -> { tok, cost }    (the caller keeps its own cost logic)
//   code: "solve.py"            -> the answer is shown as a code panel with line numbers + highlighting
// Returns { reason(text), write(text), stop(summaryLine) }.
const FADE = [237, 239, 241, 244, 248, 255];
export function thinkPanel({ model, stats, feed = [], feedTitle = "reading your Excel…", thinkTitle = "is thinking", writeTitle = "writing the answer…", code = null, rows = 6, codeRows = 12 }) {
  const name = model.split("/").pop();
  const t0 = Date.now();
  let reasoning = "", content = "", phase = feed.length ? "feed" : "wait", shownR = 0, shownC = 0, f = 0;
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  const metaLine = () => { const s = stats(); return `${secs()}s · ${Math.round(s.tok).toLocaleString("en")} tok · $${s.cost.toFixed(4)}`; };
  const api = {
    reason(t) { reasoning += t; if (phase === "feed" || phase === "wait") phase = "think"; },
    write(t) { content += t; phase = "write"; },
  };
  if (!isTTY) {
    let lastPrinted = "";
    const id = setInterval(() => {
      const what = phase === "write" ? writeTitle : phase === "think" ? `${thinkTitle}` : feedTitle;
      const tail = phase === "think" ? `: ${clip(reasoning.replace(/\s+/g, " ").trim(), 60)}` : "";
      const line = `    ${name} ${what} ${metaLine()}${tail}`;
      if (line !== lastPrinted) out(line + "\n");
      lastPrinted = line;
    }, 5000);
    return { ...api, stop(summary) { clearInterval(id); out(summary + "\n"); } };
  }
  const reg = region();
  const grow = (shown, len) => Math.min(len, shown + Math.max(3, Math.ceil((len - shown) / 4)));
  const faded = (lines) => lines.map((l, i) => `${fg(FADE[FADE.length - lines.length + i] ?? 255)}${l}${c.reset}`);
  const padTop = (lines, n) => [...Array(Math.max(0, n - lines.length)).fill(""), ...lines.slice(-n)];
  const draw = () => {
    f++;
    const W = panelWidth(), inner = W - 4;
    const foot = `${c.violet}${wave(f, phase === "think" ? 1 : 0.6)}${c.reset}`;
    let title, body;
    if (phase === "write" && code) {
      shownC = grow(shownC, content.length);
      const src = stripFences(content.slice(0, shownC)).split("\n");
      const n = src.length;
      title = `${c.pink}◆${c.reset} ${c.white}${c.bold}${name}${c.reset} is writing ${c.white}${code}${c.reset} ${c.grey}· ${n} lines · ${metaLine()}${c.reset}`;
      body = padTop(src.map((l, i) => `${c.grey}${String(i + 1).padStart(4)} │${c.reset} ${highlightPy(l)}${i === n - 1 ? `${c.pink}▌${c.reset}` : ""}`), codeRows);
    } else if (phase === "write") {
      shownC = grow(shownC, content.length);
      title = `${c.pink}◆${c.reset} ${c.white}${c.bold}${name}${c.reset} ${c.grey}· ${writeTitle} · ${metaLine()}${c.reset}`;
      body = padTop(faded(wrap(content.slice(0, shownC).slice(-inner * rows * 2), inner).filter((l, i, a) => l || i < a.length - 1).slice(-rows)), rows);
    } else if (phase === "think") {
      shownR = grow(shownR, reasoning.length);
      const txt = reasoning.slice(Math.max(0, shownR - inner * rows * 3), shownR).replace(/\*\*/g, "").replace(/\n{2,}/g, "\n");
      title = `${c.pink}◆${c.reset} ${c.white}${c.bold}${name}${c.reset} ${thinkTitle} ${c.grey}· ${metaLine()}${c.reset}`;
      body = padTop(faded(wrap(txt, inner).filter((l, i, a) => l || i < a.length - 1).slice(-rows)), rows);
    } else {
      title = `${c.pink}◆${c.reset} ${c.white}${c.bold}${name}${c.reset} ${c.grey}· ${feedTitle} · ${metaLine()}${c.reset}`;
      if (phase === "feed") {
        const i = f % feed.length;
        const win = Array.from({ length: rows }, (_, k) => feed[(i + k) % feed.length].replace(/\t+/g, " · "));
        body = faded(win.map((l) => fit(l, inner)));
      } else body = padTop([`${c.pink}${spin(f)}${c.reset} ${c.grey}waiting for the first token${c.reset}`], rows);
    }
    reg.draw(frame(body, { width: W, title, foot }));
  };
  draw();
  const id = setInterval(draw, 80);
  return { ...api, stop(summary) { clearInterval(id); reg.clear(); out(summary + "\n"); } };
}

export async function revealChecks(results) {
  for (const r of results) {
    const head = `    ${c.grey}${r.key.slice(0, 2)}${c.reset}  ${r.label.padEnd(24)} `;
    const val = r.value === undefined ? "(missing)" : JSON.stringify(r.value);
    if (isTTY) {
      for (let i = 0; i < 9; i++) { out(`\r\x1b[2K${head}${c.grey}${".".repeat(i)}${spin(i)}${c.reset}`); await sleep(70); }
    }
    const m = r.ok ? `${c.green}${c.bold}✓ right${c.reset}` : `${c.red}${c.bold}✗ wrong${c.reset}`;
    out(`${isTTY ? "\r\x1b[2K" : ""}${head}${c.white}${val.padEnd(16)}${c.reset} ${m}\n`);
    if (isTTY) await sleep(160);
  }
}

// answers.json, pretty and colored
export function showJson(obj) {
  for (const [k, v] of Object.entries(obj)) out(`    ${c.grey}${k.padEnd(36)}${c.reset} ${c.white}${c.bold}${JSON.stringify(v)}${c.reset}\n`);
}

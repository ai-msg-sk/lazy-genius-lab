// Zero-dependency terminal theatre: banner, progress bar, live ticker, dramatic reveal.
export const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const esc = (code) => (isTTY ? `\x1b[${code}m` : "");
export const c = {
  reset: esc(0), bold: esc(1), dim: esc(2),
  pink: esc("38;5;161"), red: esc("38;5;203"), green: esc("38;5;42"), yellow: esc("38;5;221"),
  grey: esc("38;5;245"), white: esc("38;5;255"), violet: esc("38;5;141"),
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (s) => process.stdout.write(s);
const width = () => Math.min(process.stdout.columns || 80, 100);

if (isTTY) {
  out("\x1b[?25l");
  const restore = () => out("\x1b[?25h\x1b[0m");
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
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

// "  label ...⠹" while fn runs, then "  ✓ label  detail" / "  ✗ label  detail". fn returns [ok, detail].
export async function checkLine(label, fn, minMs = 350) {
  let f = 0;
  const id = isTTY ? setInterval(() => out(`\r\x1b[2K    ${c.pink}${SPIN[f++ % 10]}${c.reset} ${label}`), 70) : null;
  const t = Date.now();
  let res;
  try { res = await fn(); } catch (e) { res = [false, e.message]; }
  if (isTTY) { await sleep(Math.max(0, minMs - (Date.now() - t))); clearInterval(id); }
  const [ok, detail = ""] = res;
  const mark = ok === null ? `${c.grey}·${c.reset}` : ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
  out(`${isTTY ? "\r\x1b[2K" : ""}    ${mark} ${label}${detail ? `  ${ok === false ? c.red : c.grey}${detail}${c.reset}` : ""}\n`);
  return ok;
}

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

export function box(lines, color = c.pink) {
  const vis = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
  const w = Math.max(...lines.map(vis)) + 4;
  out(`\n  ${color}╭${"─".repeat(w)}╮${c.reset}\n`);
  for (const l of lines) out(`  ${color}│${c.reset}  ${l}${" ".repeat(w - vis(l) - 2)}${color}│${c.reset}\n`);
  out(`  ${color}╰${"─".repeat(w)}╯${c.reset}\n\n`);
}
const SHADES = [161, 162, 163, 164, 135, 141];

export async function banner(word, subtitle) {
  out("\n");
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

// A live status line redrawn ~12×/s until stop(). render() returns the text.
export function live(render) {
  if (!isTTY) return { stop: (final) => final && out(final + "\n") };
  let f = 0;
  const id = setInterval(() => out(`\r\x1b[2K${fit(render(f++), (process.stdout.columns || 80) - 1)}`), 80);
  return { stop: (final) => { clearInterval(id); out(`\r\x1b[2K${final ?? ""}\n`); } };
}

// Cut a string with ANSI colors to n visible characters (a wrapped live line can't be redrawn).
export function fit(s, n) {
  let vis = 0, outS = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\x1b") { const m = s.slice(i).match(/^\x1b\[[0-9;?]*[A-Za-z]/); if (m) { outS += m[0]; i += m[0].length - 1; continue; } }
    if (vis >= n) break;
    outS += s[i]; vis++;
  }
  return outS + (isTTY ? "\x1b[0m" : "");
}

export const SPIN =["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BARS = "▁▂▃▄▅▆▇█";
export function wave(frame, intensity = 1) {
  let s = "";
  for (let i = 0; i < 12; i++) s += BARS[Math.min(7, Math.max(0, Math.round((Math.sin((frame + i * 1.7) / 2.2) + 1) * 3.5 * intensity)))];
  return s;
}

export const clip = (s, n) => (s.length > n ? "…" + s.slice(s.length - n + 1) : s);

export async function revealChecks(results) {
  for (const r of results) {
    const head = `    ${c.grey}${r.key.slice(0, 2)}${c.reset}  ${r.label.padEnd(24)} `;
    const val = r.value === undefined ? "(missing)" : JSON.stringify(r.value);
    if (isTTY) {
      for (let i = 0; i < 9; i++) { out(`\r\x1b[2K${head}${c.grey}${".".repeat(i)}${SPIN[i % 10]}${c.reset}`); await sleep(70); }
    }
    const mark = r.ok ? `${c.green}${c.bold}✓ right${c.reset}` : `${c.red}${c.bold}✗ wrong${c.reset}`;
    out(`${isTTY ? "\r\x1b[2K" : ""}${head}${c.white}${val.padEnd(16)}${c.reset} ${mark}\n`);
    if (isTTY) await sleep(160);
  }
}

export function scoreBox({ score, cost, seconds, round }) {
  const color = score === 5 ? c.green : score >= 3 ? c.yellow : c.red;
  const inner = [
    `${c.grey}SCORE${c.reset}  ${color}${c.bold}${score}/5${c.reset}      ${c.grey}COST${c.reset}  ${c.white}${c.bold}$${cost.toFixed(4)}${c.reset}      ${c.grey}TIME${c.reset}  ${c.white}${c.bold}${seconds.toFixed(1)}s${c.reset}`,
    `${c.grey}Write it on your sheet → Round ${round} column.${c.reset}`,
  ];
  const vis = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
  const w = Math.max(...inner.map(vis)) + 4;
  out(`\n  ${c.pink}╭${"─".repeat(w)}╮${c.reset}\n`);
  for (const l of inner) out(`  ${c.pink}│${c.reset}  ${l}${" ".repeat(w - vis(l) - 2)}${c.pink}│${c.reset}\n`);
  out(`  ${c.pink}╰${"─".repeat(w)}╯${c.reset}\n\n`);
}

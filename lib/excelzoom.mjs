// Round A theatre: an "Excel zoom-out". A close-up of the Catering sheet types in, Ctrl+C sweeps the top
// rows, then the camera pulls back until the whole workbook is one rectangle (6 sheet blocks, area ∝ rows)
// and only the thin top strip that was actually pasted lights up. Zero deps, one write per frame.
//
// excelZoom() returns false (and draws nothing) when the terminal can't take it: not a TTY / NO_COLOR,
// LAB_ASCII, fewer than 70 columns or 20 rows. The caller then just shows its coverage bars.
import { isTTY, ASCII, cols, sleep, out } from "./tui.mjs";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const F = (n) => `${ESC}38;5;${n}m`;
const B = (n) => `${ESC}48;5;${n}m`;
const BOLD = `${ESC}1m`;
const MARGIN = "    ";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hash = (x, y, k = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const num = (n) => n.toLocaleString("en");
const compact = (n) => (n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`);
const chars = (s) => [...String(s).normalize("NFC")];

function canvas(H, W) {
  const ch = Array.from({ length: H }, () => Array(W).fill(" "));
  const st = Array.from({ length: H }, () => Array(W).fill(""));
  return {
    H, W, ch, st,
    put(y, x, s, style = "") {
      if (y < 0 || y >= H) return;
      let i = 0;
      for (const g of chars(s)) { const xx = x + i++; if (xx >= 0 && xx < W) { ch[y][xx] = g; st[y][xx] = style; } }
    },
    toString() {
      let o = "";
      for (let y = 0; y < H; y++) {
        let cur = null, line = MARGIN;
        for (let x = 0; x < W; x++) { if (st[y][x] !== cur) { line += RESET + st[y][x]; cur = st[y][x]; } line += ch[y][x]; }
        o += `\r${ESC}2K${line.replace(/ +$/, "")}${RESET}\n`;
      }
      return o;
    },
  };
}

// the rows shown in the close-up: real Catering rows from the excerpt (TEST rows, € formats, STORNO lines)
function closeUpRows(excerpt) {
  const sec = excerpt.split(/^### /m).find((s) => s.startsWith("Catering"));
  if (!sec) return null;
  const lines = sec.split("\n").slice(1).filter((l) => l.includes("\t")).map((l) => l.split("\t"));
  const head = lines[0], data = lines.slice(1).map((cells, i) => ({ num: i + 2, cells }));
  if (!head || data.length < 8) return null;
  const pick = new Set([0, 1]);
  const add = (pred, k = 1) => { for (const r of data) { if (k <= 0) break; if (!pick.has(r.num - 2) && pred(r.cells)) { pick.add(r.num - 2); k--; } } };
  add((c) => /^€/.test(c[4] ?? ""));
  add((c) => c[1] !== "TEST" && !/STORNO/.test(c[2] ?? ""), 2);
  add((c) => /STORNO/.test(c[2] ?? ""), 2);
  add(() => true, 7 - pick.size);
  const rows = [...pick].sort((a, b) => a - b).slice(0, 7).map((i) => data[i]);
  const clean = (r) => r.map((v, j) => (j === 0 ? v.slice(0, 16) : v ?? ""));
  return [{ num: 1, cells: head, head: true }, ...rows.map((r) => ({ ...r, cells: clean(r.cells) }))];
}

function gridLayout(rows, W) {
  const gw = 5, nCol = rows[0].cells.length;
  const caps = [16, 10, 19, 3, 7, 8];
  let colW = rows[0].cells.map((_, j) => Math.min(caps[j] ?? 10, Math.max(...rows.map((r) => chars(r.cells[j] ?? "").length))));
  let pad = 1;
  const width = () => colW.reduce((s, w) => s + w + pad * 2 + 1, 0);
  if (gw + width() > W) pad = 0;
  while (gw + width() > W && colW.length > 4) colW = colW.slice(0, -1);
  while (gw + width() > W) colW[2]--;
  const colX = [];
  let x = gw;
  for (const w of colW) { colX.push(x); x += w + pad * 2 + 1; }
  return { gw, pad, colW, colX, nCol: Math.min(nCol, colW.length), right: x, rows };
}

// final workbook rectangle: blocks side by side, width ∝ rows (same height → area ∝ rows), min 1 column
function blockLayout(sheets, W) {
  const gap = 1, avail = W - gap * (sheets.length - 1), tot = sheets.reduce((s, x) => s + x.of, 0);
  const raw = sheets.map((s) => (s.of / tot) * avail);
  const w = raw.map((r) => Math.max(1, Math.floor(r)));
  let left = avail - w.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) w[order[k][1]]++;
  while (left < 0) { const i = w.indexOf(Math.max(...w)); w[i]--; left++; }
  let x = 0;
  return sheets.map((s, i) => { const b = { ...s, x, w: w[i] }; x += w[i] + gap; return b; });
}

// labels under the blocks: name (+ rows) centered when it fits, otherwise a ╰ leader on a free line
function labelLayout(blocks, W, nLines) {
  const used = Array.from({ length: nLines }, () => Array(W).fill(false));
  const free = (y, a, b) => a >= 0 && b <= W && used[y].slice(a, b).every((u) => !u);
  const take = (y, a, b) => { for (let i = a; i < b; i++) used[y][i] = true; };
  const items = [];
  const byWidth = [...blocks].sort((a, b) => b.w - a.w);
  for (const b of byWidth) {
    const rows = `${num(b.of)} rows`;
    if (chars(b.name).length <= b.w) {
      const nx = b.x + Math.floor((b.w - chars(b.name).length) / 2);
      items.push({ y: 0, x: nx, text: b.name, style: BOLD + F(252) }); take(0, b.x, b.x + b.w);
      const r = chars(rows).length <= b.w ? rows : chars(num(b.of)).length <= b.w ? num(b.of) : "";
      if (r) { const rx = b.x + Math.floor((b.w - chars(r).length) / 2); items.push({ y: 1, x: rx, text: r, style: F(244) }); take(1, rx, rx + chars(r).length); }
      b.labelled = true;
    }
  }
  for (const b of [...blocks].reverse()) {
    if (b.labelled) continue;
    const cx = b.x + Math.floor(b.w / 2), body = `${b.name} · ${num(b.of)} rows`, len = chars(body).length + 2;
    for (let y = 0; y < nLines; y++) {
      const rightward = cx + len <= W, a = rightward ? cx : cx - len + 1, bb = a + len;
      let ok = free(y, a, bb);
      for (let k = 0; k < y && ok; k++) ok = !used[k][cx];
      if (!ok) continue;
      for (let k = 0; k < y; k++) { items.push({ y: k, x: cx, text: "│", style: F(240) }); used[k][cx] = true; }
      items.push(rightward
        ? { y, x: cx, text: "╰ ", style: F(240), tail: { text: body, style: F(250) } }
        : { y, x: a, text: body, style: F(250), tail: { text: " ╯", style: F(240) } });
      take(y, a, bb);
      break;
    }
  }
  return items;
}

/**
 * Play the zoom-out. sheets: [{ name, n, of }] (pasted rows / total rows per sheet), excerpt: the pasted text,
 * total: rows in the whole workbook. Returns true if it played.
 */
export async function excelZoom({ sheets, excerpt, total }) {
  const rowsAvail = process.stdout.rows || 24;
  const Hb = Math.min(14, rowsAvail - 8);
  if (!isTTY || ASCII || cols() < 70 || Hb < 12 || !sheets?.length) return false;
  const W = Math.min(cols() - 6, 118);
  const rows = closeUpRows(excerpt);
  const cat = sheets.find((s) => s.name === "Catering");
  if (!rows || !cat) return false;

  const H = Hb + 6, LBL = 1 + Hb, NOTE = H - 1;
  const G = gridLayout(rows, W);
  const blocks = blockLayout(sheets, W);
  const labels = labelLayout(blocks, W, 4);
  const seen = sheets.reduce((s, x) => s + x.n, 0);
  total = total || sheets.reduce((s, x) => s + x.of, 0);
  const pct = Math.round((seen / total) * 100);
  const R = rows.length, GY = 2; // first grid row line
  const letters = "ABCDEFGH";

  let drawn = false;
  const draw = (cv) => { out(`${ESC}?2026h${drawn ? `${ESC}${H}A` : ""}${cv}${ESC}?2026l`); drawn = true; };
  const play = async (ms, fn) => {
    const t0 = Date.now();
    for (;;) {
      const t = clamp((Date.now() - t0) / ms);
      const cv = canvas(H, W); fn(cv, t); draw(cv);
      if (t >= 1) return;
      await sleep(33);
    }
  };

  // ── the spreadsheet close-up ────────────────────────────────────────────────────────────────────
  const totalChars = rows.reduce((s, r) => s + r.cells.slice(0, G.nCol).reduce((a, v) => a + chars(v).length, 0), 0);
  const tabs = sheets.map((s) => s.name);
  function grid(cv, { typed = Infinity, sel = 0, u = 0, caption = "" }) {
    const r = u > 0 ? Math.max(1, Math.round(Math.exp(u * Math.log(cat.of / (R - 1))))) : 1;
    const fadeHead = (u - 0.3) / 0.5; // letters row + tab bar dissolve
    const putFade = (y, x, s, style) => { let i = 0; for (const g of chars(s)) { if (hash(x + i, y, 3) >= fadeHead) cv.put(y, x + i, g, style); i++; } };
    // letters row
    putFade(1, 0, " ".repeat(G.right), B(236) + F(250));
    for (let j = 0; j < G.nCol; j++) putFade(1, G.colX[j] + G.pad + Math.floor((G.colW[j] - 1) / 2), letters[j], B(236) + F(250));
    let left = typed;
    for (let i = 0; i < R; i++) {
      const y = GY + i, row = rows[i];
      const startRow = u > 0 ? 1 + i * r : row.num;
      const selected = u > 0 ? startRow <= cat.n : i < sel;
      const base = selected ? B(125) + F(255) : row.head ? F(255) : F(252);
      // gutter
      const g = u > 0 ? compact(startRow) : String(row.num);
      if (u < 0.9) cv.put(y, 0, g.padStart(G.gw - 1) + " ", B(236) + (selected ? F(211) : F(245)));
      for (let j = 0; j < G.nCol; j++) {
        const x0 = G.colX[j], w = G.colW[j] + G.pad * 2;
        const txt = chars(row.cells[j] ?? "").slice(0, G.colW[j]);
        const before = left, shown = clamp(before, 0, txt.length);
        left -= txt.length;
        const cell = Array(w).fill(" ");
        txt.slice(0, shown).forEach((ch, k) => (cell[G.pad + k] = ch));
        if (typed !== Infinity && before >= 0 && before < txt.length) cell[G.pad + shown] = "▌";
        for (let k = 0; k < w; k++) {
          const x = x0 + k;
          if (u > 0 && hash(x, y) < u / 0.45) cv.put(y, x, "·", selected ? F(161) : F(242));
          else cv.put(y, x, cell[k], (cell[k] === "▌" ? F(161) : base) + (row.head ? BOLD : ""));
        }
        const sx = x0 + w;
        if (u > 0 && hash(sx, y, 1) < (u - 0.2) / 0.4) cv.put(y, sx, "·", selected ? F(161) : F(242));
        else cv.put(y, sx, "│", selected && j < G.nCol - 1 ? B(125) + F(131) : F(238));
      }
    }
    if (u === 0) {
      cv.put(GY + R, 0, "   ⋮", F(240));
      let x = 0;
      for (const t of tabs) { const on = t === "Catering"; cv.put(GY + R + 1, x, ` ${t} `, on ? B(238) + F(255) + BOLD : F(244)); x += chars(t).length + 2; cv.put(GY + R + 1, x++, "│", F(238)); }
    } else if (fadeHead < 1) {
      let x = 0;
      for (const t of tabs) { putFade(GY + R + 1, x, ` ${t} `, F(242)); x += chars(t).length + 3; }
    }
    if (caption) cv.put(0, 0, caption.text, caption.style);
    if (caption?.tail) cv.put(0, chars(caption.text).length, caption.tail.text, caption.tail.style);
  }

  // typing the cells in
  await play(850, (cv, t) => grid(cv, { typed: Math.round(totalChars * t), caption: { text: "Catering", style: BOLD + F(255), tail: { text: ` · rows 1–${R} of ${num(cat.of)} on screen`, style: F(244) } } }));
  // Ctrl+C: selection sweeps over the top rows, counter runs on past the screen
  await play(600, (cv, t) => grid(cv, { sel: Math.max(1, Math.ceil(R * clamp(t * 1.6))), caption: { text: " Ctrl+C ", style: B(125) + F(255) + BOLD, tail: { text: `  selecting rows 1 → ${num(Math.round(lerp(R, cat.n, ease(t))))}`, style: F(211) } } }));
  await play(250, (cv) => grid(cv, { sel: R, caption: { text: " Ctrl+C ", style: B(125) + F(255) + BOLD, tail: { text: `  copied the first ${num(cat.n)} of ${num(cat.of)} rows · now zoom out`, style: F(211) } } }));

  // ── zoom out, part 1: cells turn into dots, each line covers more and more rows ──────────────────
  const fieldW = G.right - G.gw;
  await play(800, (cv, t) => {
    const u = Math.max(0.001, ease(t));
    const r = Math.max(1, Math.round(Math.exp(u * Math.log(cat.of / (R - 1)))));
    grid(cv, { sel: R, u, caption: { text: "zooming out · ", style: F(244), tail: { text: `1 line ≈ ${num(r)} rows`, style: BOLD + F(255) } } });
  });

  // ── zoom out, part 2: the Catering field shrinks into its block, the other sheets slide in ───────────
  const ci = blocks.findIndex((b) => b.name === "Catering");
  function blocksAt(cv, v, { reveal = -1, pulse = 0 } = {}) {
    const y = Math.round(lerp(GY, 1, v)), h = Math.round(lerp(R, Hb, v)), gap = v > 0.15 ? 1 : 0;
    let x = Math.round(lerp(G.gw, 0, v));
    const wipe = reveal < 0 ? -1 : reveal * (W + 4);
    const strip = [125, 161, 198, 205, 198, 161, 125, 161, 198, 161][Math.min(9, Math.floor(pulse * 10))];
    const placed = [];
    blocks.forEach((b, i) => {
      const w = Math.round(lerp(i === ci ? fieldW : 0, b.w, v));
      if (w <= 0) return;
      const halves = Math.max(1, Math.round((b.n / b.of) * h * 2));
      const lit = reveal >= 0 || i === ci;
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
        const xx = x + k, top = 2 * j < halves && lit, bot = 2 * j + 1 < halves && lit;
        if (reveal < 0) cv.put(y + j, xx, "·", top ? F(161) : F(242));
        else if (top) cv.put(y + j, xx, bot ? "█" : "▀", F(strip));
        else cv.put(y + j, xx, xx < wipe ? "░" : "·", xx < wipe ? F(239) : F(242));
      }
      placed.push({ ...b, px: x, pw: w });
      x += w + gap;
    });
    const area = placed.reduce((s, b) => s + b.pw * h, 0), rowsIn = placed.reduce((s, b) => s + b.of, 0);
    return { perChar: Math.max(1, Math.round(rowsIn / Math.max(1, area))), placed };
  }
  await play(1100, (cv, t) => {
    const v = ease(t);
    const { perChar } = blocksAt(cv, v);
    cv.put(0, 0, "zooming out · ", F(244));
    cv.put(0, 14, `1 character ≈ ${num(perChar)} rows`, BOLD + F(255));
    if (v > 0.8) cv.put(0, 14 + chars(`1 character ≈ ${num(perChar)} rows`).length, `  · the whole workbook, ${num(total)} rows`, F(244));
  });

  // ── reveal: the strip that was pasted lights up, the rest goes grey ──────────────────────────────
  const cb = blocks[ci];
  const top = `▼ this is all the AI gets: ${num(seen)} of ${num(total)} rows (${pct} %)`;
  const topX = Math.max(0, Math.min(cb.x + 1, W - chars(top).length));
  const grey = `░ everything grey: the AI never sees it (${num(total - seen)} rows, ${100 - pct} %)`;
  const labelChars = labels.reduce((s, l) => s + chars(l.text).length + (l.tail ? chars(l.tail.text).length : 0), 0);
  await play(1300, (cv, t) => {
    blocksAt(cv, 1, { reveal: clamp(t / 0.35), pulse: clamp(t / 0.8) });
    let budget = Math.round(labelChars * clamp((t - 0.05) / 0.4));
    for (const l of labels) {
      const a = chars(l.text).slice(0, Math.max(0, budget)); budget -= chars(l.text).length;
      cv.put(LBL + l.y, l.x, a.join(""), l.style);
      if (l.tail && budget > 0) { cv.put(LBL + l.y, l.x + chars(l.text).length, chars(l.tail.text).slice(0, budget).join(""), l.tail.style); budget -= chars(l.tail.text).length; }
    }
    const tt = chars(top).slice(0, Math.round(chars(top).length * clamp((t - 0.25) / 0.35)));
    cv.put(0, topX, tt.join(""), BOLD + F(t < 1 && Math.floor(t * 12) % 2 ? 198 : 161));
    const gg = chars(grey).slice(0, Math.round(chars(grey).length * clamp((t - 0.5) / 0.35)));
    cv.put(NOTE, 0, gg.join(""), F(245));
  });
  out("\n");
  return true;
}

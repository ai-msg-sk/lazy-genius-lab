// Round A theatre: an "Excel zoom-out". A close-up of the Catering sheet types in, Ctrl+C sweeps the top
// rows, then the camera pulls back until the whole workbook is one rectangle (6 sheet blocks, area ∝ rows)
// and only the thin top strip that was actually pasted lights up. Zero deps, one write per frame.
//
// excelZoom() returns false (and draws nothing) when the terminal can't take it: not a TTY / NO_COLOR,
// LAB_ASCII, fewer than 70 columns or 20 rows. The caller then just shows its coverage bars.
import { readFileSync } from "node:fs";
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

// sheets under ~6 % of the workbook would be a 1–3 column sliver with an unreadable label: fold them
// into one combined block ("Program + Registrácie") so every block can carry its own label and count
function mergeSmall(sheets) {
  const tot = sheets.reduce((s, x) => s + x.of, 0);
  const small = sheets.filter((s) => s.of / tot < 0.06);
  if (small.length < 2) return sheets.map((s) => ({ ...s }));
  const merged = { name: small.map((s) => s.name).join(" + "), n: small.reduce((s, x) => s + x.n, 0), of: small.reduce((s, x) => s + x.of, 0), parts: small };
  const res = [];
  for (const s of sheets) if (!small.includes(s)) res.push({ ...s }); else if (s === small[0]) res.push(merged);
  return res;
}

// final workbook rectangle: blocks side by side, width ∝ rows (same height → area ∝ rows), min 3 columns
function blockLayout(sheets, W) {
  const gap = 1, avail = W - gap * (sheets.length - 1), tot = sheets.reduce((s, x) => s + x.of, 0);
  const raw = sheets.map((s) => (s.of / tot) * avail);
  const w = raw.map((r) => Math.max(3, Math.floor(r)));
  let left = avail - w.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) w[order[k][1]]++;
  while (left < 0) { const i = w.indexOf(Math.max(...w)); w[i]--; left++; }
  let x = 0;
  return sheets.map((s, i) => { const b = { ...s, x, w: w[i] }; x += w[i] + gap; return b; });
}

// sent/total text that fits inside a strip of width w (most detailed first)
function stripText(b, w) {
  const p = Math.round((b.n / b.of) * 100);
  const opts = [`${num(b.n)} / ${num(b.of)} · ${p} %`, `${num(b.n)} / ${num(b.of)}`, `${num(b.n)}/${num(b.of)}`, `${compact(b.n)}/${compact(b.of)}`, num(b.n), compact(b.n)];
  const o = opts.find((s) => chars(s).length <= w) ?? "";
  return o && chars(o).length + 2 <= w ? ` ${o} ` : o;
}

// labels under the blocks: name (bold) over "N rows" (grey), both centered on the block. Widest blocks
// first on lines 0–1; a label that would collide drops to lines 2–3 with a straight │ tick (no diagonals)
function labelLayout(blocks, W) {
  const occ = [[], []], items = [];
  const free = (tier, a, b) => occ[tier].every(([p, q]) => b + 1 <= p || a >= q + 1);
  for (const b of [...blocks].sort((p, q) => q.w - p.w)) {
    const name = b.name, rows = `${num(b.of)} rows`, cx = b.x + b.w / 2;
    const at = (s) => clamp(Math.round(cx - chars(s).length / 2), 0, W - chars(s).length);
    const nx = at(name), rx = at(rows);
    const a = Math.min(nx, rx), e = Math.max(nx + chars(name).length, rx + chars(rows).length);
    const tier = free(0, a, e) ? 0 : 1;
    occ[tier].push([a, e]);
    items.push({ y: tier * 2, x: nx, text: name, style: BOLD + F(252) }, { y: tier * 2 + 1, x: rx, text: rows, style: F(244) });
    if (tier === 1) b.tick = Math.floor(cx);
  }
  // ticks: only where nothing on lines 0–1 is in the way
  for (const b of blocks) {
    if (b.tick == null) continue;
    const t = b.tick;
    const hit = items.some((l) => l.y < 2 && t >= l.x - 1 && t <= l.x + chars(l.text).length);
    if (!hit) items.unshift({ y: 0, x: t, text: "│", style: F(240) }, { y: 1, x: t, text: "│", style: F(240) });
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

  // rows 0–2: status line, later the chat bubble · 3: caption · YB…YB+HB-1: the workbook rectangle
  // LBL…LBL+3: block labels · NOTE: the "everything grey" line. Same height for every frame.
  const H = Hb + 6, YB = 4, HB = Hb - 3, LBL = YB + HB, NOTE = H - 1;
  const G = gridLayout(rows, W);
  const blocks = blockLayout(mergeSmall(sheets), W);
  const labels = labelLayout(blocks, W);
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
  const FILL = B(236) + F(239), FILL_CH = "░"; // the never-sent mass: a solid dim background, same on every row
  const PULSE = [125, 161, 198, 205, 198, 161, 125, 161, 198, 161];
  // a raspberry strip (one full row) with its sent/total count centered inside, clipped to x < upto
  const drawStrip = (cv, y, x, w, b, bg, upto = Infinity) => {
    const txt = b ? chars(stripText(b, w)) : [], tx = x + Math.floor((w - txt.length) / 2);
    for (let k = 0; k < w; k++) {
      if (x + k >= upto) break;
      const g = txt[x + k - tx];
      cv.put(y, x + k, g ?? " ", B(bg) + F(255) + (g && g !== " " ? BOLD : ""));
    }
  };
  // v: 0 = close-up field, 1 = final rectangle. reveal: wipe progress (-1 = still dots).
  // lifted(i) → that block's strip has left (finale): its row becomes a faint cut line
  function blocksAt(cv, v, { reveal = -1, pulse = 1, lifted = () => false } = {}) {
    const y = Math.round(lerp(GY, YB, v)), h = Math.round(lerp(R, HB, v)), gap = v > 0.15 ? 1 : 0;
    let x = Math.round(lerp(G.gw, 0, v));
    const wipe = reveal < 0 ? -1 : reveal * (W + 4);
    const bg = PULSE[Math.min(9, Math.floor(pulse * 10))];
    const placed = [];
    blocks.forEach((b, i) => {
      const w = Math.round(lerp(i === ci ? fieldW : 0, b.w, v));
      if (w <= 0) return;
      const sh = clamp(Math.round((b.n / b.of) * h), 1, h);
      const lit = reveal >= 0 || i === ci, gone = lifted(i);
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
        const xx = x + k, inStrip = j < sh && lit;
        if (reveal < 0 || xx >= wipe) cv.put(y + j, xx, "·", inStrip ? F(161) : F(242));
        else if (!inStrip) cv.put(y + j, xx, FILL_CH, FILL);
        else if (gone) cv.put(y + j, xx, "╌", F(239));
      }
      if (reveal >= 0 && !gone) for (let j = 0; j < sh; j++) drawStrip(cv, y + j, x, w, j === 0 ? b : null, bg, wipe);
      placed.push({ ...b, px: x, pw: w });
      x += w + gap;
    });
    const area = placed.reduce((s, b) => s + b.pw * h, 0), rowsIn = placed.reduce((s, b) => s + b.of, 0);
    return { perChar: Math.max(1, Math.round(rowsIn / Math.max(1, area))), placed };
  }
  let perCharEnd = 1;
  await play(1000, (cv, t) => {
    const v = ease(t);
    const { perChar } = blocksAt(cv, v);
    perCharEnd = perChar;
    cv.put(0, 0, "zooming out · ", F(244));
    cv.put(0, 14, `1 character ≈ ${num(perChar)} rows`, BOLD + F(255));
    if (v > 0.8) cv.put(0, 14 + chars(`1 character ≈ ${num(perChar)} rows`).length, `  · the whole workbook, ${num(total)} rows`, F(244));
  });

  // ── reveal: the grey mass fills in, the pasted strip on top of every block lights up ─────────────────
  const top = `▼ this is all the AI gets: ${num(seen)} of ${num(total)} rows (${pct} %)`;
  const greyText = ` everything grey: the AI never sees it (${num(total - seen)} rows, ${100 - pct} %)`;
  const status = (cv) => { cv.put(0, 0, `the whole workbook · 1 character ≈ ${num(perCharEnd)} rows`, F(240)); };
  const labelChars = labels.reduce((s, l) => s + chars(l.text).length, 0);
  const drawLabels = (cv, budget = Infinity) => {
    for (const l of labels) { cv.put(LBL + l.y, l.x, chars(l.text).slice(0, Math.max(0, budget)).join(""), l.style); budget -= chars(l.text).length; }
  };
  const drawNote = (cv, n = Infinity) => {
    if (n <= 0) return;
    cv.put(NOTE, 0, FILL_CH, FILL);
    cv.put(NOTE, 1, chars(greyText).slice(0, n - 1).join(""), F(245));
  };
  await play(1100, (cv, t) => {
    status(cv);
    blocksAt(cv, 1, { reveal: clamp(t / 0.4), pulse: clamp(t / 0.85) });
    drawLabels(cv, Math.round(labelChars * clamp((t - 0.05) / 0.4)));
    const tt = chars(top).slice(0, Math.round(chars(top).length * clamp((t - 0.25) / 0.3)));
    cv.put(YB - 1, 0, tt.join(""), BOLD + F(t < 1 && Math.floor(t * 12) % 2 ? 198 : 161));
    drawNote(cv, Math.round((chars(greyText).length + 1) * clamp((t - 0.5) / 0.3)));
  });

  // ── finale: the strips lift off and converge into one chat message; the grey stays behind ──────────
  let bytes = Buffer.byteLength(excerpt ?? "");
  try { bytes = JSON.parse(readFileSync(new URL("../data/sizes.json", import.meta.url), "utf8")).excerptBytes || bytes; } catch {}
  const title = ` 1 chat message · ${num(Math.round(bytes / 1024))} KB `;
  const foot = ` ${num(seen)} of ${num(total)} rows · ${pct} % `;
  const gaps = blocks.length - 1, srcW = blocks.reduce((s, b) => s + b.w, 0);
  const minInner = Math.max(chars(title).length, chars(foot).length) + 4;
  const k = (Math.max(minInner, Math.round(W * 0.55)) - gaps) / srcW;
  const dw = blocks.map((b) => Math.max(3, Math.round(b.w * k)));
  const inner = dw.reduce((a, b) => a + b, 0) + gaps, BW = inner + 4, BX = Math.floor((W - BW) / 2);
  const dst = []; { let x = BX + 2; for (const w of dw) { dst.push(x); x += w + 1; } }
  const order = blocks.map((b, i) => i).sort((a, b) => blocks[b].w - blocks[a].w); // biggest strip leaves first
  const prog = (t, i) => ease(clamp((t - 0.1 - 0.07 * order.indexOf(i)) / 0.55));
  function bubble(cv, p, footN) {
    const bw = Math.max(2, Math.round(lerp(4, BW, p))), x0 = BX + Math.floor((BW - bw) / 2), bc = F(125);
    cv.put(0, x0, "╭" + "─".repeat(bw - 2) + "╮", bc);
    cv.put(1, x0, "│", bc); cv.put(1, x0 + bw - 1, "│", bc);
    cv.put(2, x0, "╰" + "─".repeat(bw - 2) + "╯", bc);
    if (bw >= chars(title).length + 4) cv.put(0, x0 + 2, title, BOLD + F(255));
    if (footN > 0) cv.put(2, x0 + 2, chars(foot).slice(0, footN).join(""), F(211));
  }
  await play(1000, (cv, t) => {
    const done = blocks.map((_, i) => prog(t, i) > 0);
    blocksAt(cv, 1, { reveal: 1, lifted: (i) => done[i] });
    drawLabels(cv);
    drawNote(cv);
    if (t < 0.12) cv.put(YB - 1, 0, top, BOLD + F(161));
    bubble(cv, ease(clamp(t / 0.35)), Math.round(chars(foot).length * clamp((t - 0.7) / 0.25)));
    blocks.forEach((b, i) => {
      const p = prog(t, i);
      if (p <= 0) return;
      // slight overshoot-free arc: x/width ease in, y rises a touch earlier so strips don't skim the caption
      const py = clamp(p * 1.25), y = Math.round(lerp(YB, 1, py));
      const x = Math.round(lerp(b.x, dst[i], p)), w = Math.round(lerp(b.w, dw[i], p));
      drawStrip(cv, y, x, w, b, 161);
    });
  });
  out("\n");
  return true;
}

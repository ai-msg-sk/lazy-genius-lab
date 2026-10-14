// The finale: one idea per screen, then a certificate made to be photographed.
// Alternate screen, centred pages, redrawn on resize. Enter/Space/→ next, ← back, q skip to the end.
// Each page moves on by itself after a few seconds, except the certificate (photo time).
// Not a TTY / NO_COLOR / LAB_ASCII → only the short summary (printSummary).
import { c, fg, sleep, isTTY, ASCII, out, cols } from "./tui.mjs";
import { FONT, WORDS } from "./cert-art.mjs";
import { ART } from "./logo-art.mjs";
import { qrBlock, qrFit, qrSize } from "./qr.mjs";
import { QR_URL } from "./qr-art.mjs";
import { renderCommunity, COMMUNITY_URL } from "./community.mjs";

// ── palette ─────────────────────────────────────────────────────────────────────────────────────────
const RASP = fg(161), RASP2 = fg(125), LAV = fg(183), LAV2 = fg(141), GREEN = fg(42), RED = fg(203);
const G1 = fg(240), G2 = fg(245), G3 = fg(250), WHITE = fg(255), B = c.bold, R = c.reset;

// ── numbers ─────────────────────────────────────────────────────────────────────────────────────────
export const money = (n) => (!n ? "$0" : n >= 1000 ? `$${Math.round(n).toLocaleString("en")}` : n >= 0.1 ? `$${n.toFixed(2)}` : `$${Number(n.toPrecision(2))}`);
export const secs = (s) => (!s ? "—" : s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
export const times = (x) => (x >= 10 ? `${Math.round(x)}×` : `${Number(x.toFixed(1))}×`);
const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

// ── text helpers ────────────────────────────────────────────────────────────────────────────────────
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const wid = (s) => { let n = 0; for (const ch of s.replace(ANSI_RE, "")) { const cp = ch.codePointAt(0); n += cp >= 0x1f300 ? 2 : cp === 0xfe0f ? 0 : 1; } return n; };
const padR = (s, n) => s + " ".repeat(Math.max(0, n - wid(s)));
const padC = (s, n) => { const k = Math.max(0, n - wid(s)), l = Math.floor(k / 2); return " ".repeat(l) + s + " ".repeat(k - l); };

// Big text from the glyph table (rows = text rows). Unknown characters fall back to upper case, then blank.
function bigText(str, rows) {
  const f = FONT[rows], thin = Array(rows).fill(" ".repeat(Math.max(1, Math.ceil(rows / 2) - 1)));
  const gl = [...String(str).toUpperCase()].map((ch) => (ch === "\u2009" ? thin : f[ch] ?? f[" "]));
  return Array.from({ length: rows }, (_, y) => gl.map((g) => g[y]).join(" "));
}
const bigW = (str, rows) => bigText(str, rows)[0].length;
// Largest size (≤ maxRows) whose width fits maxW. → rows (0 = does not fit even at 2 rows)
function bigRows(strs, maxW, maxRows, minRows = 2) {
  for (let r = Math.min(8, maxRows); r >= minRows; r--) if (strs.every((s) => bigW(s, r) <= maxW)) return r;
  return 0;
}
const paint = (lines, col) => lines.map((l) => `${col}${l}${R}`);
// Blocks side by side, each padded to its own width (rows come out equally wide), top-aligned.
function hcat(blocks, gap = 4) {
  const ws = blocks.map((b) => Math.max(0, ...b.map(wid))), h = Math.max(...blocks.map((b) => b.length));
  return Array.from({ length: h }, (_, y) => blocks.map((b, i) => padR(b[y] ?? "", ws[i])).join(" ".repeat(gap)));
}
const kicker = (s) => `${RASP}▸${R} ${G3}${B}${s}${R}`;

// ── pages ───────────────────────────────────────────────────────────────────────────────────────────
// Each page: { name, auto (seconds, null = wait), render(t, W, H) → lines (centred by the engine) or { full: lines } }.

function pageResult(d) {
  const { A, Bx, bScore } = d;
  return {
    name: "Your result", auto: 12,
    render(t, W, H) {
      const colW = Math.min(44, Math.floor((W - 8) / 2));
      const aScore = `${A.score}/5`, bScoreS = bScore === null ? "?/5" : `${Bx.score}/5`;
      const r = bigRows([aScore, bScoreS], colW, Math.max(2, Math.min(7, H - 15)));
      const col = (tag, sub, score, stats, cTag, cScore, show) => {
        if (!show) return Array(r + 5).fill("");
        const big = r ? paint(bigText(score, r), cScore + B) : [`${cScore}${B}${score}${R}`];
        return [`${cTag}${B}${tag}${R}`, `${G2}${sub}${R}`, "", ...big, "", `${WHITE}${stats}${R}`].map((l) => padC(l, colW));
      };
      const aCol = col("ROUND A", "the AI guessed", aScore, `${money(A.cost)} · ${secs(A.secs)}`, RASP, RASP, t > 0.15);
      const bCol = col("ROUND B", "the AI wrote code", bScoreS, `${money(Bx.cost)} · ${secs(Bx.secs)}`, LAV, GREEN, t > 0.9);
      const lines = [kicker("Your result"), "", ...hcat([aCol, bCol], 4)];
      lines.push("", "");
      const xc = Bx.cost ? A.cost / Bx.cost : 0, xt = Bx.secs ? A.secs / Bx.secs : 0;
      let head;
      if (bScore === null) head = `${WHITE}${B}Round B not checked yet.${R} ${G2}After Round B run${R} ${RASP}$${R} ${WHITE}${B}node verify.mjs${R}`;
      else if (Bx.score < 5) head = `${WHITE}${B}B: ${Bx.score}/5${R} ${G2}— ask your agent to fix the ✗, then${R} ${RASP}$${R} ${WHITE}${B}node verify.mjs${R}`;
      else head = `${WHITE}${B}Same task. ${GREEN}${times(xc)} cheaper.${WHITE}${xt >= 1.5 ? ` ${times(xt)} faster.` : ""} And right.${R}`;
      lines.push(t > 1.6 ? head : "");
      if (bScore === 5) lines.push("", t > 2.4 ? `${G2}A read a slice of the Excel and guessed. B's code read every row.${R}` : "");
      if (A.ref || Bx.ref) lines.push("", `${G1}(missing runs filled with the speaker's reference numbers)${R}`);
      return lines;
    },
  };
}

function pageTeam(d) {
  const { A, Bx, devs, perDay, days, reports } = d;
  const yearly = devs * perDay * days, aYear = A.cost * yearly, bYear = Bx.cost * reports, wrong = Math.round(yearly * (1 - A.score / 5));
  return {
    name: "In a real team", auto: 12,
    render(t, W, H) {
      const colW = Math.min(46, Math.floor((W - 8) / 2));
      const grp = (s) => s.replace(/,/g, "\u2009");
      const aS = grp(money(aYear)), bS = grp(money(bYear));
      const r = bigRows([aS, bS], colW, Math.max(2, Math.min(6, H - 16)));
      const roll = (v, final, u) => { const s = grp(money(v * ease(u))); return s.length < final.length ? " ".repeat(final.length - s.length) + s : s; };
      const col = (final, v, u, label, color, show) => {
        if (!show) return Array(r + 2).fill("");
        const s = roll(v, final, u), big = r ? paint(bigText(s, r), color + B) : [`${color}${B}${s}${R}`];
        return [...big, "", `${color}${label}${R}`].map((l) => padC(l, colW));
      };
      const lines = [kicker("In a real team"), "", `${WHITE}${devs} devs × ${perDay} questions a day × a year${R}`, "", ""];
      lines.push(...hcat([col(aS, aYear, (t - 0.3) / 1.3, "pasting into chat", RASP, t > 0.3), col(bS, bYear, (t - 2.0) / 0.8, "writing the code once", LAV, t > 2.0)], 4));
      lines.push("", "");
      if (wrong > 0) lines.push(t > 3.2 ? `${RED}${B}${Math.round(wrong * ease((t - 3.2) / 0.9)).toLocaleString("en")} wrong answers${R}` : "");
      lines.push("", t > 4.4 ? `${G2}Pasting pays for every question. Code is paid once, then runs for free.${R}` : "");
      return lines;
    },
  };
}

function pageWhy() {
  const words = [["RIGHT", GREEN, "a test checks the code"], ["CHEAP", LAV, "written once, reruns at $0"], ["REPEATABLE", WHITE, "same data, same answer"]];
  return {
    name: "Why", auto: 12,
    render(t, W, H) {
      const r = bigRows(words.map((w) => w[0]), W - 6, Math.max(2, Math.min(5, Math.floor((H - 12) / 3) - 1)));
      const lines = [kicker("Why it works"), ""];
      words.forEach(([w, col, why], i) => {
        const show = t > 0.2 + i * 0.6;
        const big = r ? paint(bigText(w, r), col + B) : [`${col}${B}${w}${R}`];
        lines.push(...(show ? big : big.map(() => "")), show ? `${G2}${why}${R}` : "", "");
      });
      lines.push(t > 2.2 ? `${WHITE}${B}AI writes${RASP}.${WHITE} Code runs${RASP}.${WHITE} AI checks${RASP}.${R}` : "");
      lines.push(t > 2.8 ? `${G2}Put it in your CLAUDE.md tomorrow.${R}` : "");
      return lines;
    },
  };
}

// Plain text on a raspberry plate, three rows tall: readable on a phone photo at any terminal size.
function plate(text, t) {
  const bg = `\x1b[48;5;${[161, 161, 162, 168, 168, 162][Math.floor(t * 3) % 6]}m`, w = wid(text) + 10;
  return ["", text, ""].map((l) => `${bg}${WHITE}${B}${padC(l, w)}${R}`);
}

// Right before the certificate: 7 s of one instruction, big. Ends with a camera-shutter flash.
const HASHTAGS = "#OpenSlava  #LazyGenius";
function pagePhotoCall() {
  return {
    name: "Photo", auto: 7,
    render(t, W, H) {
      if (t > 6.5) { // shutter: white, fading to the dark of the certificate
        const bg = [255, 255, 254, 252, 249, 246, 243, 240][Math.min(7, Math.floor((t - 6.5) / 0.065))];
        return { full: Array(H).fill(`\x1b[48;5;${bg}m${" ".repeat(W)}`) };
      }
      const igW = (r) => WORDS["TAG US ON"][r][0].length + 3 + WORDS.ig[r][0].length;
      // the handle is the one thing that must be readable on the photo: big letters only from 5 rows up
      // (smaller they smear); otherwise a raspberry plate with plain text, which any camera reads
      const handleRows = (r) => { for (let h = Math.min(8, r + 1); h >= 5; h--) if (WORDS.handle[h][0].length <= W - 6) return h; return 0; };
      const fits = (r) => { const h = handleRows(r); return Math.max(WORDS["TAKE A PHOTO"][r][0].length, igW(r)) <= W - 6 && 2 * r + (h || 3) + 9 <= H; };
      let r = 8; while (r > 2 && !fits(r)) r--;
      if (!fits(r)) return [`${WHITE}${B}📸 TAKE A PHOTO${R}`, "", `${LAV}${B}Tag us on Instagram${R}`, `${RASP}${B}@msglifeslovakia${R}`, "", `${G2}${HASHTAGS}${R}`];
      const pulse = Math.floor(t * 2.5) % 2 ? fg(205) : RASP;
      const hide = (lines, show) => (show ? lines : lines.map(() => ""));
      const left = Math.max(0, Math.ceil(6.5 - t));
      return [
        ...hide(paint(WORDS["TAKE A PHOTO"][r], WHITE + B), t > 0.15), "",
        ...hide(hcat([paint(WORDS["TAG US ON"][r], LAV + B), paint(WORDS.ig[r], pulse + B)], 3), t > 1.0), "",
        ...hide(handleRows(r) ? paint(WORDS.handle[handleRows(r)], pulse + B) : plate("@msglifeslovakia", t), t > 1.8), "",
        t > 2.6 ? `${LAV2}${B}${HASHTAGS}${R}` : "", "", "",
        t > 3.2 ? `${G2}your certificate in ${WHITE}${B}${left}${R}${G2} … get your phone ready${R}` : "",
      ];
    },
  };
}

// The peak: a full-screen certificate. Only the frame light and two sparkles move; the text never changes.
const RUN = [125, 161, 168, 205, 218, 205, 168, 161];
function pageCert(d) {
  const { A, Bx, name, seat } = d;
  const x = Bx.cost ? A.cost / Bx.cost : 0;
  const result = `Round B 5/5 · ${money(Bx.cost)}${x >= 1.5 ? ` · ${times(x)} cheaper than guessing` : ""}`;
  const nameS = name ? [...name.toUpperCase()].join(" ") : "";
  const logo = ART.msg.map((l) => l.replace(/\{([^}]*)\}/g, `${RASP}$1${WHITE}`));
  return {
    name: "Certificate", auto: null,
    render(t, W, H) {
      const iw = W - 6, ih = H - 2;  // inside the frame (frame + 2 cols padding each side)
      const brand = (big) => big
        ? hcat([logo.map((l) => `${WHITE}${l}${R}`), ["", "", `${G2}×${R}  ${WHITE}${B}OPENSLAVA '26${R}`, ""]], 3)
        : [`${RASP}●${WHITE}${B}msg${R}  ${G2}×${R}  ${WHITE}${B}OPENSLAVA '26${R}`];
      // the Instagram band: raspberry, slowly breathing, impossible to miss
      const bandBg = `\x1b[48;5;${[161, 161, 162, 168, 168, 162][Math.floor(t * 3) % 6]}m`;
      const one = `📸  TAKE A PHOTO  ·  TAG @msglifeslovakia  ·  ${HASHTAGS}`;
      const bandTxt = wid(one) + 8 <= iw ? [one] : ["📸  TAKE A PHOTO", `TAG @msglifeslovakia  ·  ${HASHTAGS}`];
      const bw = Math.min(iw, Math.max(...bandTxt.map(wid)) + 8);
      const pillLines = ["", ...bandTxt, ""].map((l) => `${bandBg}${WHITE}${B}${padC(l, bw)}${R}`);
      const tail = [
        ...(nameS ? [`${WHITE}${B}${nameS}${R}`] : []),
        ...(seat ? [`${G2}Seat ${seat}${R}`] : []),
        "",
        `${GREEN}${B}${result}${R}`,
        `${G2}14 Oct 2026 · Bratislava · workshop partner ${G3}ElevenLabs${R}`,
        "",
        ...pillLines,
      ];
      let body = null;
      for (let r = 8; r >= 2 && !body; r--) {
        const tickW = Math.max(0, ...(FONT[r2of(r)]["✓"] ?? []).map((l) => l.length));
        if (WORDS["LAZY GENIUS"][r][0].length + 6 > iw || WORDS.CERTIFIED[r2of(r)][0].length + 2 * (tickW + 2) > iw) continue;
        for (const bigLogo of [true, false]) {
          const head = brand(bigLogo);
          if (spare0(ih, head, r, r2of(r), tail) >= 0) { body = { r, head }; break; }
        }
      }
      if (!body) return { full: [`${WHITE}${B}LAZY GENIUS · CERTIFIED${R}`, "", ...tail].map((l) => padC(l, W)) };
      const { r, head } = body, r2 = r2of(r);
      const lg = paint(WORDS["LAZY GENIUS"][r], WHITE + B), cf = paint(WORDS.CERTIFIED[r2], LAV + B);
      // sparkles left and right of LAZY GENIUS (they never touch the text)
      const sp = ["  ", " ·", " ✧", " ✦", " ✧", " ·", "  ", "  "];
      const s1 = sp[Math.floor(t * 6) % sp.length], s2 = sp[Math.floor(t * 6 + 4) % sp.length];
      const lgW = WORDS["LAZY GENIUS"][r][0].length;
      const lgS = lg.map((l, i) => i === 0 ? `${LAV}${s1}${R} ${l} ${LAV}${s2.split("").reverse().join("")}${R}` : `   ${l}   `);
      const tick = FONT[r2]["✓"] ?? [], tw = Math.max(0, ...tick.map((l) => l.length));
      const cfS = cf.map((l, i) => `${" ".repeat(tw + 2)}${l}  ${GREEN}${B}${tick[i] ?? ""}${R}`);
      // the name: big letters when it is plain ASCII and there is room, else letter-spaced
      const nameBig = name && /^[A-Za-z .'-]+$/.test(name) && spare0(ih, head, r, r2, tail) >= 4 && bigW(name, 3) <= iw - 4 ? paint(bigText(name, 3), WHITE + B) : null;
      let tl = nameBig ? ["", ...nameBig, ...tail.slice(1)] : tail;
      // spare rows left? the handle again, big, with the Instagram glyph
      const left_ = ih - (head.length + 1 + r + 1 + r2 + 1 + tl.length);
      for (const hr of [6, 5]) { // smaller than 5 rows the big handle is unreadable on a photo
        const blk = hcat([paint(WORDS.ig[hr], RASP + B), paint(WORDS.handle[hr], RASP + B)], 3);
        if (left_ >= hr + 3 && wid(blk[0]) <= iw - 4) { tl = [...tl, "", "", ...blk]; break; }
      }
      const content = [...head, "", ...lgS, "", ...cfS, "", ...tl];
      // breathe: spread spare rows above/below
      const spare = ih - content.length, top = Math.floor(spare / 2);
      const inner = [...Array(top).fill(""), ...content, ...Array(spare - top).fill("")];
      // frame with a light running along it
      const per = 2 * (W + H), at = (i) => fg(RUN[Math.floor((((i / per) * 48 - t * 10) % RUN.length) + RUN.length) % RUN.length]);
      const rows = [];
      let top_ = "", bot = "";
      for (let x = 0; x < W; x++) { top_ += at(x) + (x === 0 ? "╔" : x === W - 1 ? "╗" : "═"); bot += at(2 * W + H - x) + (x === 0 ? "╚" : x === W - 1 ? "╝" : "═"); }
      rows.push(top_ + R);
      inner.forEach((l, i) => rows.push(`${at(per - i)}║${R}${padC(l, W - 2)}${at(W + i)}║${R}`));
      rows.push(bot + R);
      void lgW;
      return { full: rows };
    },
  };
}

const r2of = (r) => (r <= 4 ? r : r - 1); // CERTIFIED: one step smaller than LAZY GENIUS when big
const spare0 = (ih, head, r, r2, tail) => ih - (head.length + 1 + r + 1 + r2 + 1 + tail.length);

// Not 5/5 yet: the certificate is shown as locked (loss aversion), with the one step to unlock it.
function pageLocked(d) {
  return {
    name: "Certificate", auto: 15,
    render(t, W, H) {
      const r = bigRows(["LAZY GENIUS"], W - 6, Math.max(2, Math.min(4, H - 14)));
      const lg = r ? paint(WORDS["LAZY GENIUS"][r], G1 + B) : [`${G1}${B}LAZY GENIUS${R}`];
      return [kicker("Your certificate"), "", ...lg, "", `${G2}🔒 locked · unlocks at Round B 5/5${R}`, "",
        d.bScore === null ? `${WHITE}Finish Round B, then${R} ${RASP}$${R} ${WHITE}${B}node verify.mjs${R}`
          : `${WHITE}You're at ${d.Bx.score}/5. Ask your agent to fix the ✗, then${R} ${RASP}$${R} ${WHITE}${B}node verify.mjs${R}`];
    },
  };
}

function pageBonus() {
  const text = [
    kicker("One more thing"), "",
    `${WHITE}${B}The organizers found a second export.${R}`,
    `${WHITE}${B}Does your code survive it?${R}`, "",
    `${RASP}$${R} ${WHITE}${B}node bonus.mjs${R}`, "", "",
    `${G2}Done?${R} ${RASP}$${R} ${WHITE}${B}node cleanup.mjs${R}`,
    `${G1}(your work in my-work/ stays)${R}`,
  ];
  // the same, narrower, for next to the QR on small screens
  const narrow = [
    kicker("One more thing"), "",
    `${WHITE}${B}The organizers found${R}`, `${WHITE}${B}a second export.${R}`, `${WHITE}${B}Does your code survive?${R}`, "",
    `${RASP}$${R} ${WHITE}${B}node bonus.mjs${R}`, "", "",
    `${G2}Done?${R}`, `${RASP}$${R} ${WHITE}${B}node cleanup.mjs${R}`, `${G1}(my-work/ stays)${R}`,
  ];
  return {
    name: "One more thing", auto: 45,
    render(t, W, H) {
      const avail = H - 1;
      const title = "Rate the workshop · 1 min";
      // 1) text above the QR  2) side by side  3) text only
      let fit = qrFit(W - 4, avail - text.length - 1, { allowScale2: true });
      if (fit) return [...text, "", ...qrBlock({ t, ...fit, title }).map((l) => padC(l, qrSize(fit.scale, fit.framed).w))];
      fit = qrFit(W - Math.max(...narrow.map(wid)) - 6, H, { allowScale2: false });
      if (fit) {
        const q = qrBlock({ t, ...fit, title }), side = fit.framed ? narrow : [...narrow, "", `${G2}◂ rate the workshop${R}`, `${G2}  1 minute, scan it${R}`];
        const right = [...Array(Math.max(0, Math.floor((q.length - side.length) / 2))).fill(""), ...side];
        return hcat([q, right], 4);
      }
      return [...text, "", `${G2}Rate the workshop:${R} ${WHITE}${QR_URL}${R}`];
    },
  };
}

// Last page: where the next workshop is announced. A living colour field around a scannable QR.
function pageCommunity() {
  return { name: "Stay in touch", auto: null, render: (t, W, H) => ({ full: renderCommunity(t, W, H) }) };
}

// ── engine ──────────────────────────────────────────────────────────────────────────────────────────
export const canPage = () => isTTY && !ASCII;

export async function runFinale(d, { only = null } = {}) {
  d = { devs: 10, perDay: 20, days: 220, reports: 20, ...d, Bx: d.B };
  const cert = d.bScore === 5 ? pageCert(d) : pageLocked(d);
  let pages = [pageResult(d), pageTeam(d), pageWhy(), ...(d.bScore === 5 ? [pagePhotoCall()] : []), cert, pageBonus(), pageCommunity()];
  if (only === "cert") pages = d.bScore === 5 ? [pagePhotoCall(), cert] : [cert];
  const stdin = process.stdin, canKey = stdin.isTTY && typeof stdin.setRawMode === "function";
  if (!canKey) for (const p of pages) p.auto ??= 40; // nobody can press Enter: don't hang

  let i = 0, t0 = Date.now(), done = false, dirty = true;
  const go = (k) => { if (k >= pages.length) done = true; else { i = Math.max(0, k); t0 = Date.now(); dirty = true; } };
  const onKey = (buf) => {
    const s = buf.toString();
    if (s === "\x03") { leave(); process.exit(130); }
    if (s === "\r" || s === "\n" || s === " " || s === "\x1b[C" || s === "\x1bOC") go(i + 1);
    else if (s === "\x1b[D" || s === "\x1bOD") go(i - 1);
    else if (s === "q" || s === "Q" || s === "\x1b") { if (i < pages.length - 1) go(pages.length - 1); else done = true; }
  };
  const onResize = () => { dirty = true; };
  let inAlt = false;
  const leave = () => { if (!inAlt) return; inAlt = false; out("\x1b[0m\x1b[?1049l\x1b[?25h"); };
  process.on("exit", leave);
  out("\x1b[?1049h\x1b[?25l\x1b[2J"); inAlt = true;
  if (canKey) { stdin.setRawMode(true); stdin.resume(); stdin.on("data", onKey); }
  process.stdout.on("resize", onResize);

  try {
    while (!done) {
      const W = cols(), H = process.stdout.rows || 24, p = pages[i], t = (Date.now() - t0) / 1000;
      if (p.auto && t > p.auto) { go(i + 1); continue; }
      const res = p.render(t, W, H - 1);
      let body;
      if (res.full) body = res.full;
      else {
        const lines = res.slice(0, H - 1), top = Math.max(0, Math.floor((H - 1 - lines.length) / 2));
        const bw = Math.max(...lines.map(wid)), left = " ".repeat(Math.max(0, Math.floor((W - bw) / 2)));
        // centre each line inside the block, the block inside the screen
        body = [...Array(top).fill(""), ...lines.map((l) => left + padC(l, bw))];
      }
      body = body.slice(0, H - 1);
      while (body.length < H - 1) body.push("");
      body.push(footer(p, i, pages.length, t, W, canKey));
      out(`\x1b[?2026h${dirty ? "\x1b[2J" : ""}\x1b[H` + body.map((l) => `\x1b[2K${l}${R}`).join("\r\n") + "\x1b[?2026l");
      dirty = false;
      await sleep(70);
    }
  } finally {
    if (canKey) { stdin.setRawMode(false); stdin.off("data", onKey); stdin.pause(); }
    process.stdout.off("resize", onResize);
    leave();
  }
}

function footer(p, i, n, t, W, canKey) {
  const keys = canKey ? (i === n - 1 ? "Enter ▸ finish" : "Enter ▸ next") + (i ? " · ← back" : "") : "";
  const label = `${p.auto ? "" : "📸 photo time · "}${keys}${keys ? " · " : ""}page ${i + 1}/${n}`;
  const barW = Math.min(24, Math.max(0, W - wid(label) - 8));
  let bar = "";
  if (p.auto && barW > 4) { const k = Math.round(barW * Math.min(1, t / p.auto)); bar = `${RASP2}${"━".repeat(k)}${G1}${"─".repeat(barW - k)}${R}  `; }
  return padC(`${bar}${G2}${label}${R}`, W);
}

// The short summary left in the normal scrollback (also the whole output when pages are off).
export function printSummary({ A, B, bScore }) {
  const x = B.cost ? A.cost / B.cost : 0, xt = B.secs ? A.secs / B.secs : 0;
  const k = (s) => (isTTY ? `${c.pink}$${c.reset} ${c.white}${c.bold}${s}${c.reset}` : `$ ${s}`);
  const g = (s) => (isTTY ? `${c.grey}${s}${c.reset}` : s);
  const bS = bScore === null ? "not checked yet" : `${B.score}/5 · ${money(B.cost)} · ${secs(B.secs)}`;
  const tail = bScore === 5 ? `  ${isTTY ? c.green + c.bold : ""}${times(x)} cheaper${xt >= 1.5 ? `, ${times(xt)} faster` : ""}${isTTY ? c.reset : ""}` : "";
  out(`\n  Round A ${A.score}/5 · ${money(A.cost)} · ${secs(A.secs)}   vs   Round B ${bS}${tail}\n`);
  out(`  ${g("certificate")}  ${k("node compare.mjs")}\n`);
  out(`  ${g("bonus      ")}  ${k("node bonus.mjs")}\n`);
  out(`  ${g("cleanup    ")}  ${k("node cleanup.mjs")}  ${g("(your work in my-work/ stays)")}\n`);
  out(`  ${g("feedback   ")}  ${QR_URL}\n`);
  out(`  ${g("next events")}  ${COMMUNITY_URL}\n\n`);
}

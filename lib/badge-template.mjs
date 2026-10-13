// badge.html: the "Lazy Genius certified" Instagram story card (1080×1920).
// One Canvas 2D renderer draws the card on the page AND the downloaded PNG, so they are pixel-identical.
// Self-contained: inline CSS/JS, the msg logo as inline paths. Only the fonts come from Google Fonts
// (offline it falls back to system fonts).

// msg logo (assets/msg.svg): viewBox 0 0 150 48, paths in a 0.306122 scaled group.
const LOGO = {
  dot: "M0,93.229C0,79.139 11.421,67.717 25.511,67.717C39.602,67.717 51.023,79.139 51.023,93.229C51.023,107.318 39.602,118.74 25.511,118.74C11.421,118.74 0,107.318 0,93.229Z",
  word: [
    "M67.464,0.751L67.464,117.992L88.859,117.992L88.859,18.59L137.864,18.59L137.864,117.992L159.327,117.992L159.327,18.59L191.92,18.59C202.927,18.59 210.698,25.195 210.698,39.52L210.698,117.992L232.111,117.992L232.111,33.591C232.111,17.624 223.875,0.751 202.698,0.751L67.464,0.751Z",
    "M274.967,0.751C251.857,0.751 244.855,16.1 244.855,33.288C244.855,51.648 252.484,67.113 273.484,67.113L324.412,67.113C340.016,67.113 340.016,79.108 340.016,84.565C340.016,89.651 340.016,100.118 324.803,100.118L246.855,100.118L246.855,117.992L333.76,117.992C355.434,117.992 361.641,105.26 361.641,84.723C361.641,60.254 353.65,49.287 335.129,49.287L280.141,49.287C266.266,49.287 266.266,39.912 266.266,33.663C266.266,28.788 267.641,18.59 282.516,18.59L357.641,18.59L357.641,0.751L274.967,0.751Z",
    "M489.971,0.751L489.971,128.432C489.971,145.15 483.531,154 463.643,154L389.881,154L389.881,135.232L456.807,135.232C466.945,135.232 468.643,131.373 468.652,122.525C468.668,121.574 468.643,117.992 468.643,117.992L417.299,117.992C397.053,117.992 390.461,114.754 386.479,111.912C380.566,106.943 374.783,101.117 374.783,80.291L374.783,37.965C374.893,18.308 380.123,12.526 385.834,7.972C391.066,3.799 398.166,0.751 417.25,0.751L489.971,0.751ZM468.643,18.59L468.643,100.118L423.748,100.118C410.479,100.196 397.023,101.117 396.674,83.934C396.66,83.221 396.604,76.893 396.674,58.513C396.734,42.924 396.592,39.199 396.674,37.586C397.416,23.188 402.729,18.064 424.695,18.59C425.982,18.622 468.643,18.59 468.643,18.59Z",
  ],
};

const logoSVG = (word = "#FFFFFF", dot = "#A01441") =>
  `<svg viewBox="0 0 150 48" role="img" aria-label="msg" xmlns="http://www.w3.org/2000/svg" style="fill-rule:evenodd"><g transform="scale(0.306122)"><path d="${LOGO.dot}" fill="${dot}"/>${LOGO.word.map((d) => `<path d="${d}" fill="${word}"/>`).join("")}</g></svg>`;

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// d = the strings to print (see lib/badge.mjs → badgeData)
export function badgeHTML(d) {
  const data = JSON.stringify({ ...d, logo: LOGO }).replace(/</g, "\\u003c");
  const alt = `Lazy Genius certified at OpenSlava '26. Round A, the AI guessed: ${d.a.score}, ${d.a.cost}. Round B, the AI wrote code: ${d.b.score}, ${d.b.cost}. ${d.big} ${d.word1} ${d.word2}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lazy Genius certified</title>
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Montserrat:ital,wght@0,500;0,600;0,700;0,800;0,900;1,600;1,700&display=swap">
<style>
  :root { --ink: #0B0128; --glow: #631BC2; --lav: #E5B1FC; --rasp: #A01441; --white: #fff; --mute: rgba(255,255,255,.62);
          --sans: Montserrat, "Helvetica Neue", Arial, sans-serif; --mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { background: #07001A radial-gradient(1200px 800px at 75% -10%, rgba(99,27,194,.35), transparent 60%); color: var(--white);
         font: 500 16px/1.5 var(--sans); }
  main { min-height: 100vh; display: flex; align-items: center; justify-content: center; gap: 56px; padding: 24px 16px; }
  .card { display: block; height: calc(100vh - 48px); max-height: 1920px; min-height: 480px; width: auto; aspect-ratio: 1080 / 1920;
          border-radius: 26px; box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(229,177,252,.14); background: var(--ink); }
  aside { width: 340px; flex: none; }
  aside svg { width: 92px; height: auto; display: block; margin-bottom: 28px; }
  h1 { font: 800 30px/1.15 var(--sans); margin: 0 0 8px; letter-spacing: -.01em; }
  h1 em { font-style: normal; color: var(--lav); }
  .lede { color: var(--mute); margin: 0 0 28px; }
  ol { list-style: none; padding: 0; margin: 0 0 28px; display: grid; gap: 14px; }
  li { display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 17px; }
  li b { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font: 800 15px var(--sans);
         background: rgba(229,177,252,.12); color: var(--lav); border: 1px solid rgba(229,177,252,.35); }
  li span strong { color: var(--lav); }
  .btns { display: grid; gap: 10px; }
  button { font: 700 16px var(--sans); border-radius: 999px; padding: 15px 22px; cursor: pointer; border: 1px solid rgba(229,177,252,.4);
           background: transparent; color: var(--white); transition: transform .12s ease, background .12s ease; }
  button:hover { background: rgba(229,177,252,.1); }
  button:active { transform: scale(.98); }
  button.primary { background: var(--lav); color: var(--ink); border-color: var(--lav); font-weight: 800; font-size: 17px; }
  button.primary:hover { background: #F0CCFF; }
  button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  .caption { margin-top: 22px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
             font: 400 13px/1.55 var(--mono); color: rgba(255,255,255,.75); white-space: pre-wrap; }
  .tip { color: var(--mute); font-size: 13px; margin-top: 16px; }
  .status { min-height: 20px; color: var(--lav); font-size: 13px; margin-top: 8px; }
  @media (max-width: 860px) {
    main { flex-direction: column; gap: 28px; }
    .card { width: 100%; max-width: 480px; height: auto; min-height: 0; }
    aside { width: 100%; max-width: 480px; }
  }
</style>
</head>
<body>
<main>
  <canvas class="card" id="card" width="1080" height="1920" role="img" aria-label="${esc(alt)}"></canvas>
  <aside>
    ${logoSVG()}
    <h1>You're <em>lazy genius</em> certified${d.name ? `, ${esc(d.name)}` : ""}.</h1>
    <p class="lede">Show it off. Your story, your numbers.</p>
    <ol>
      <li><b>1</b><span>Download</span></li>
      <li><b>2</b><span>Post to your Instagram story</span></li>
      <li><b>3</b><span>Tag <strong>@msglifeslovakia</strong></span></li>
    </ol>
    <div class="btns">
      <button class="primary" id="dl">Download PNG</button>
      <button id="share" hidden>Send to my phone…</button>
      <button id="copy">Copy caption</button>
    </div>
    <div class="status" id="status" role="status"></div>
    <div class="caption" id="cap"></div>
    <p class="tip">On a laptop? AirDrop the PNG to your phone, or just screenshot the terminal.</p>
  </aside>
</main>
<script>
const D = ${data};
const W = 1080, H = 1920, M = 96;
const C = { ink: "#0B0128", glow: "#631BC2", lav: "#E5B1FC", rasp: "#A01441", raspHi: "#E0336E", white: "#FFFFFF" };
const SANS = 'Montserrat, "Helvetica Neue", Arial, sans-serif', MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const font = (w, px, fam = SANS, it = "") => \`\${it} \${w} \${px}px \${fam}\`.trim();
const sp = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; };
const a = (hex, al) => { const n = parseInt(hex.slice(1), 16); return \`rgba(\${n >> 16},\${(n >> 8) & 255},\${n & 255},\${al})\`; };

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function fitSize(ctx, text, weight, maxW, maxPx, fam = SANS) { ctx.font = font(weight, maxPx, fam); return Math.min(maxPx, Math.floor(maxPx * maxW / ctx.measureText(text).width)); }

function logo(ctx, x, y, h, word, dot) {
  ctx.save(); ctx.translate(x, y); const s = (h / 48) * 0.306122; ctx.scale(s, s);
  ctx.fillStyle = dot; ctx.fill(new Path2D(D.logo.dot));
  ctx.fillStyle = word; for (const p of D.logo.word) ctx.fill(new Path2D(p), "evenodd");
  ctx.restore();
  return (150 * h) / 48;
}

function background(ctx) {
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0B0128"); g.addColorStop(.55, "#120338"); g.addColorStop(1, "#0B0128");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, al] of [[900, 420, 900, .55], [80, 1480, 760, .38], [560, 1500, 420, .18]]) {
    g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, a(C.glow, al)); g.addColorStop(1, a(C.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // the spreadsheet: tiny cells, column letters, row numbers, a few stray values
  const cw = 72, ch = 24, gx = 40, gy = 24;
  ctx.lineWidth = 1; ctx.strokeStyle = a(C.lav, .075); ctx.beginPath();
  for (let x = gx; x <= W; x += cw) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = gy; y <= H; y += ch) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();
  ctx.fillStyle = a(C.lav, .05); ctx.fillRect(0, 0, W, gy); ctx.fillRect(0, gy, gx, H);
  ctx.font = font(500, 11, MONO); ctx.fillStyle = a(C.lav, .3); ctx.textBaseline = "middle"; ctx.textAlign = "center";
  for (let i = 0; gx + i * cw < W; i++) ctx.fillText(String.fromCharCode(65 + i), gx + i * cw + cw / 2, gy / 2 + 1);
  for (let j = 1; gy + (j - 1) * ch < H; j++) ctx.fillText(String(j), gx / 2, gy + (j - 1) * ch + ch / 2 + 1);
  let seed = 14102026; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const junk = ["4908", "6200", "#REF!", "=SUM(", "T18", "17", "0.151", "#N/A", "139609.90", "=VLOOKUP(", "storno", "TEST", "3.5★", "21:47", "1e3"];
  ctx.textAlign = "left"; ctx.font = font(400, 12, MONO);
  for (let k = 0; k < 120; k++) {
    const i = Math.floor(rnd() * 14), j = Math.floor(rnd() * 79);
    ctx.fillStyle = a(C.lav, .07 + rnd() * .09);
    ctx.fillText(junk[Math.floor(rnd() * junk.length)], gx + i * cw + 6, gy + j * ch + ch / 2 + 1);
  }
  // soften the grid in the middle so the type reads
  g = ctx.createRadialGradient(W / 2, 980, 120, W / 2, 980, 900);
  g.addColorStop(0, a("#0B0128", .55)); g.addColorStop(1, a("#0B0128", 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
}

function header(ctx) {
  const top = 220;
  logo(ctx, M, top, 50, C.white, C.rasp);
  ctx.textAlign = "right"; ctx.fillStyle = C.white; ctx.font = font(800, 40); sp(ctx, -0.5);
  ctx.fillText("OpenSlava '26", W - M, top + 44); sp(ctx, 0);
  ctx.strokeStyle = a(C.white, .18); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, top + 86); ctx.lineTo(W - M, top + 86); ctx.stroke();
  const y = top + 128;
  ctx.textAlign = "left"; ctx.font = font(500, 22, MONO); ctx.fillStyle = a(C.lav, .85); sp(ctx, 3);
  ctx.fillText("14 OCT 2026 · BRATISLAVA", M, y); sp(ctx, 0);
  ctx.textAlign = "right"; ctx.font = font(800, 24); ctx.fillStyle = C.white;
  const el = "ElevenLabs"; ctx.fillText(el, W - M, y); const ew = ctx.measureText(el).width;
  ctx.font = font(500, 24); ctx.fillStyle = a(C.white, .62); ctx.fillText("workshop partner ", W - M - ew, y);
  ctx.textAlign = "left";
}

function formulaBar(ctx, y) {
  const h = 66;
  rr(ctx, M, y, W - 2 * M, h, 14); ctx.fillStyle = a(C.white, .045); ctx.fill(); ctx.strokeStyle = a(C.lav, .28); ctx.lineWidth = 2; ctx.stroke();
  const nb = 176; // name box
  ctx.beginPath(); ctx.moveTo(M + nb, y + 12); ctx.lineTo(M + nb, y + h - 12); ctx.moveTo(M + nb + 70, y + 12); ctx.lineTo(M + nb + 70, y + h - 12); ctx.stroke();
  ctx.textBaseline = "middle"; ctx.font = font(500, 22, MONO); ctx.fillStyle = a(C.white, .7); sp(ctx, 1);
  ctx.fillText(D.seat ? "SEAT " + D.seat : "B5", M + 24, y + h / 2 + 1); sp(ctx, 0);
  ctx.font = font(700, 26, SANS, "italic"); ctx.fillStyle = C.lav; ctx.fillText("fx", M + nb + 22, y + h / 2);
  ctx.font = font(500, 28, MONO); let x = M + nb + 96;
  const parts = D.name ? [["=CERTIFY(", C.white], ['"' + D.name + '"', C.lav], [")", C.white]] : [["=LAZY_GENIUS(", C.white], ["you", C.lav], [")", C.white]];
  for (const [t, col] of parts) { ctx.fillStyle = col; ctx.fillText(t, x, y + h / 2 + 1); x += ctx.measureText(t).width; }
  ctx.fillStyle = C.lav; ctx.fillRect(x + 4, y + 18, 3, h - 36); // caret
  ctx.textBaseline = "alphabetic";
  return y + h;
}

function headline(ctx, y) {
  const maxW = W - 2 * M + 8;
  sp(ctx, -6);
  const s = fitSize(ctx, "GENIUS", 900, maxW, 216);
  ctx.font = font(900, s); ctx.fillStyle = C.white;
  const b1 = y + Math.round(s * .74), b2 = b1 + Math.round(s * .86);
  ctx.fillText("LAZY", M - 6, b1);
  ctx.fillText("GENIUS", M - 6, b2);
  // LAZY gets the raspberry dot of the logo
  const lw = ctx.measureText("LAZY").width; sp(ctx, 0);
  ctx.fillStyle = C.rasp; ctx.beginPath(); ctx.arc(M + lw + 16, b1 - s * .09, s * .1, 0, Math.PI * 2); ctx.fill();
  // CERTIFIED: the selected cell, with Excel's fill handle
  const cy = b2 + 40, cs = 70;
  ctx.font = font(800, cs); sp(ctx, 14);
  const tw = ctx.measureText("CERTIFIED").width - 14, ch = 104, cw = tw + 64;
  ctx.fillStyle = a(C.lav, .14); ctx.fillRect(M, cy, cw, ch);
  ctx.strokeStyle = C.lav; ctx.lineWidth = 5; ctx.strokeRect(M, cy, cw, ch);
  ctx.fillStyle = C.lav; ctx.fillRect(M + cw - 9, cy + ch - 9, 18, 18);
  ctx.fillStyle = C.ink; ctx.fillRect(M + cw - 9 - 3, cy + ch - 9 - 3, 3, 24); ctx.fillRect(M + cw - 9 - 3, cy + ch - 9 - 3, 24, 3);
  ctx.fillStyle = C.lav; ctx.fillText("CERTIFIED", M + 32, cy + ch / 2 + cs * .36); sp(ctx, 0);
  // the check, right of the cell
  const kx = M + cw + 70, ky = cy + ch / 2;
  if (kx + 50 < W - M) {
    ctx.strokeStyle = C.white; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(kx - 30, ky + 2); ctx.lineTo(kx - 8, ky + 26); ctx.lineTo(kx + 36, ky - 26); ctx.stroke(); ctx.lineCap = "butt";
  }
  return cy + ch;
}

function panel(ctx, x, y, w, h, r, win) {
  ctx.save();
  rr(ctx, x, y, w, h, 30);
  if (win) {
    ctx.shadowColor = a(C.lav, .45); ctx.shadowBlur = 50;
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, a(C.glow, .62)); g.addColorStop(1, a(C.lav, .14));
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = C.lav; ctx.lineWidth = 3; ctx.stroke();
  } else { ctx.fillStyle = a(C.white, .045); ctx.fill(); ctx.strokeStyle = a(C.white, .16); ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  const px = x + 34;
  ctx.font = font(700, 20, MONO); sp(ctx, 4); ctx.fillStyle = win ? C.lav : a(C.white, .55);
  ctx.fillText(win ? "ROUND B" : "ROUND A", px, y + 54); sp(ctx, 0);
  ctx.font = font(600, 29, SANS, "italic"); ctx.fillStyle = win ? C.white : a(C.white, .72);
  ctx.fillText(win ? "the AI wrote code" : "the AI guessed", px, y + 98);
  ctx.font = font(900, 132); sp(ctx, -4); ctx.fillStyle = win ? C.white : a(C.white, .42);
  ctx.fillText(r.score, px - 4, y + 228);
  const sw = ctx.measureText(r.score).width; sp(ctx, 0);
  if (!win && r.wrong) { ctx.strokeStyle = C.raspHi; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px - 10, y + 193); ctx.lineTo(px + sw + 2, y + 158); ctx.stroke(); ctx.lineCap = "butt"; }
  ctx.font = font(500, 30, MONO); ctx.fillStyle = win ? C.white : a(C.white, .7);
  ctx.fillText(r.cost + "  ·  " + r.time, px, y + 280);
  if (r.tokens) { ctx.font = font(400, 21, MONO); ctx.fillStyle = win ? a(C.lav, .9) : a(C.white, .45); ctx.fillText(r.tokens, px, y + 316); }
  if (win) { // ✓ seal
    const cx = x + w - 52, cy = y + 52;
    ctx.fillStyle = C.lav; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx - 11, cy + 1); ctx.lineTo(cx - 3, cy + 9); ctx.lineTo(cx + 12, cy - 8); ctx.stroke(); ctx.lineCap = "butt";
  }
}

function compare(ctx, y) {
  const gap = 28, w = (W - 2 * M - gap) / 2, h = 344;
  panel(ctx, M, y, w, h, D.a, false);
  panel(ctx, M + w + gap, y, w, h, D.b, true);
  const cx = W / 2, cy = y + h / 2;
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = a(C.lav, .5); ctx.lineWidth = 2; ctx.stroke();
  ctx.font = font(700, 24, SANS, "italic"); ctx.fillStyle = C.lav; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("vs", cx, cy + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  return y + h;
}

function multiplier(ctx, y) {
  ctx.font = font(800, 58); const rw = Math.max(ctx.measureText(D.word1).width, ctx.measureText(D.word2).width);
  sp(ctx, -8);
  const s = fitSize(ctx, D.big, 900, W - 2 * M - rw - 36, 200);
  ctx.font = font(900, s); const nw = ctx.measureText(D.big).width;
  const base = y + Math.round(s * .74);
  const g = ctx.createLinearGradient(M, base - s * .7, M + nw, base); g.addColorStop(0, C.white); g.addColorStop(1, C.lav);
  ctx.save(); ctx.shadowColor = a(C.lav, .5); ctx.shadowBlur = 60; ctx.fillStyle = g; ctx.fillText(D.big, M - 8, base); ctx.restore();
  sp(ctx, 0);
  const x = M + nw + 30;
  ctx.font = font(800, 58); ctx.fillStyle = C.white; ctx.fillText(D.word1, x, base - s * .38);
  ctx.fillStyle = C.lav; ctx.fillText(D.word2, x, base);
  return base;
}

function motto(ctx, y) {
  ctx.font = font(700, 41); let x = M;
  for (const part of ["AI writes", "Code runs", "AI checks"]) {
    ctx.fillStyle = C.white; ctx.fillText(part, x, y); x += ctx.measureText(part).width + 4;
    ctx.fillStyle = C.raspHi; ctx.beginPath(); ctx.arc(x + 5, y - 6, 7, 0, Math.PI * 2); ctx.fill(); x += 34;
  }
}

function cta(ctx, y) {
  const parts = [["@msglifeslovakia", C.ink, 800], ["#OpenSlava", a(C.ink, .72), 700], ["#LazyGenius", a(C.ink, .72), 700]];
  ctx.font = font(800, 34); const gap = 30;
  const ws = parts.map(([t, , w]) => { ctx.font = font(w, 34); return ctx.measureText(t).width; });
  const pw = ws.reduce((s, v) => s + v, 0) + gap * 2 + 72, h = 80;
  rr(ctx, M, y, pw, h, h / 2); ctx.fillStyle = C.lav; ctx.fill();
  let x = M + 36;
  parts.forEach(([t, col, w], i) => { ctx.font = font(w, 34); ctx.fillStyle = col; ctx.fillText(t, x, y + 52); x += ws[i] + gap; });
}

function draw(cv) {
  const ctx = cv.getContext("2d");
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  background(ctx);
  header(ctx);
  let y = formulaBar(ctx, 398);
  y = headline(ctx, y + 36);
  y = compare(ctx, y + 48);
  y = multiplier(ctx, y + 44);
  motto(ctx, y + 84);
  cta(ctx, y + 126);
  window.__badgeBottom = y + 126 + 80;
}

const fontsReady = () => Promise.race([
  Promise.all(["900 100px Montserrat", "800 100px Montserrat", "700 40px Montserrat", "600 40px Montserrat", "500 24px Montserrat", "italic 600 30px Montserrat", "italic 700 24px Montserrat",
    '500 24px "JetBrains Mono"', '700 20px "JetBrains Mono"', '400 12px "JetBrains Mono"'].map((f) => document.fonts.load(f))).catch(() => {}),
  new Promise((r) => setTimeout(r, 3000)),
]);

// Exposed for tests: draws a fresh 1080×1920 card and returns it as a PNG data URL.
window.renderBadgePNG = async () => { await fontsReady(); const cv = document.createElement("canvas"); cv.width = W; cv.height = H; draw(cv); return cv.toDataURL("image/png"); };
const pngBlob = async () => { await fontsReady(); const cv = document.createElement("canvas"); cv.width = W; cv.height = H; draw(cv); return new Promise((r) => cv.toBlob(r, "image/png")); };
const FILE = "lazy-genius-openslava26.png";
const status = (t) => { document.getElementById("status").textContent = t; };

const card = document.getElementById("card");
draw(card);
fontsReady().then(() => draw(card));
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", () => draw(card));

document.getElementById("dl").onclick = async () => {
  const blob = await pngBlob(); const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: FILE });
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  status("Saved " + FILE + ". Now post it to your story and tag @msglifeslovakia.");
};

const caption = D.caption; document.getElementById("cap").textContent = caption;
document.getElementById("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(caption); status("Caption copied."); }
  catch { const r = document.createRange(); r.selectNodeContents(document.getElementById("cap")); getSelection().removeAllRanges(); getSelection().addRange(r); status("Select-all done: press Cmd/Ctrl+C."); }
};

(async () => { // AirDrop / Messages / Mail via the system share sheet, where the browser supports sharing files
  try {
    const probe = new File([new Blob(["x"], { type: "image/png" })], FILE, { type: "image/png" });
    if (!navigator.canShare || !navigator.canShare({ files: [probe] })) return;
    const b = document.getElementById("share"); b.hidden = false;
    b.onclick = async () => { try { const f = new File([await pngBlob()], FILE, { type: "image/png" }); await navigator.share({ files: [f], text: caption }); } catch {} };
  } catch {}
})();
</script>
</body>
</html>
`;
}

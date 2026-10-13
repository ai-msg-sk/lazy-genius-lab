// The waiting-room carousel: short animated scenes inside the live model panel while the model works
// silently. The moment real reasoning or answer text streams in, the panel switches to it (watching the
// real model think beats any scene). Same frame, same size, a wipe between scenes, ~6 s per scene.
//
//   carouselPanel({ ...thinkPanel options, scenes, rows })  ->  { reason(t), write(t), stop(summary) }
//
// Not a TTY / NO_COLOR / ASCII mode: no carousel at all, it is exactly thinkPanel() (plain behaviour).
// Scene factories below: pasteScenes (Round A), writerScenes / checkerScenes (Round B).
import { readFileSync } from "node:fs";
import {
  thinkPanel, region, frame, panelWidth, fit, wrap, wave, spin, highlightPy, stripFences, fg, c, isTTY, ASCII,
} from "./tui.mjs";

const SCENE_MS = 6200, WIPE_MS = 450, FADE = [237, 239, 241, 244, 248, 255];
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const plain = (s) => s.replace(ANSI, "");
const n0 = (n) => Math.round(n).toLocaleString("en");
const pad = (lines, n) => [...lines, ...Array(Math.max(0, n - lines.length)).fill("")].slice(0, n);
const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const blink = (ms) => (Math.floor(ms / 450) % 2 ? " " : `${c.pink}▌${c.reset}`);
const typed = (s, ms, cps = 45) => s.slice(0, Math.floor((ms / 1000) * cps));
const hash = (a, b, k) => { let h = (a * 374761393 + b * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };

// "### <sheet> (first N of M rows)" headers of data/paste-excerpt.txt
export function sheetStats() {
  try {
    const txt = readFileSync(new URL("../data/paste-excerpt.txt", import.meta.url), "utf8");
    const sheets = [...txt.matchAll(/^### (.+?) \(first ([\d,]+) of ([\d,]+) rows\)/gm)]
      .map((m) => ({ name: m[1], n: Number(m[2].replace(/,/g, "")), of: Number(m[3].replace(/,/g, "")) }));
    const seen = sheets.reduce((s, x) => s + x.n, 0), all = sheets.reduce((s, x) => s + x.of, 0);
    return { sheets, seen, all, pct: all ? Math.round((seen / all) * 100) : 0 };
  } catch { return { sheets: [], seen: 0, all: 0, pct: 0 }; }
}

// ── the panel ─────────────────────────────────────────────────────────────────────────────────────
export function carouselPanel(opts) {
  const { model, stats, scenes = [], feedTitle = "reading…", thinkTitle = "is thinking", writeTitle = "writing the answer…", code = null, rows = 8, codeRows = 12 } = opts;
  if (!isTTY || ASCII || !scenes.length) return thinkPanel(opts);
  const name = model.split("/").pop();
  const t0 = Date.now();
  let reasoning = "", content = "", phase = "wait", shownR = 0, shownC = 0, f = 0;
  const secsN = () => (Date.now() - t0) / 1000;
  const metaLine = () => { const s = stats(); return `${secsN().toFixed(1)}s · ${n0(s.tok)} tok · $${s.cost.toFixed(4)}`; };
  // cost history for the $/s sparkline, sampled every 0.5 s whatever scene is up
  const hist = [];
  const sample = () => { const t = Date.now(); if (!hist.length || t - hist[hist.length - 1].t >= 500) { hist.push({ t, cost: stats().cost }); if (hist.length > 40) hist.shift(); } };
  const visits = new Map();
  let cur = -1, prev = null, sceneStart = t0;

  const reg = region();
  const grow = (shown, len) => Math.min(len, shown + Math.max(3, Math.ceil((len - shown) / 4)));
  const faded = (lines) => lines.map((l, i) => `${fg(FADE[FADE.length - lines.length + i] ?? 255)}${l}${c.reset}`);
  const padTop = (lines, n) => [...Array(Math.max(0, n - lines.length)).fill(""), ...lines.slice(-n)];

  const renderScene = (i, ms, inner) => {
    const sc = scenes[i];
    try {
      return pad(sc.render({ ms, t: ms / SCENE_MS, f, inner, rows, secs: secsN(), stats, hist, visit: visits.get(i) ?? 0 }) ?? [], rows);
    } catch (e) { return pad([`${c.grey}(${sc.label}: ${e.message})${c.reset}`], rows); }
  };

  const draw = () => {
    f++;
    const W = panelWidth(), inner = W - 4;
    const foot = `${c.violet}${wave(f, phase === "think" ? 1 : 0.6)}${c.reset}`;
    let title, body, footer = foot;
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
      sample();
      const now = Date.now();
      const want = Math.floor((now - t0) / SCENE_MS) % scenes.length;
      if (want !== cur) {
        if (cur >= 0) { prev = { i: cur, start: sceneStart }; visits.set(cur, (visits.get(cur) ?? 0) + 1); }
        cur = want; sceneStart = now;
      }
      const ms = now - sceneStart;
      body = renderScene(cur, ms, inner);
      if (prev && ms < WIPE_MS) {
        // wipe: the new scene slides in from the left behind a bright edge, the old one dims out on the right
        const old = renderScene(prev.i, now - prev.start, inner);
        const x = Math.floor(ease(ms / WIPE_MS) * inner);
        body = body.map((l, k) => {
          const rest = [...plain(old[k] ?? "")].concat(Array(inner).fill(" ")).slice(x + 1, inner).join("");
          return `${fit(l, x)}${" ".repeat(Math.max(0, x - plain(fit(l, x)).length))}${c.pink}${c.bold}▌${c.reset}${fg(238)}${rest}${c.reset}`;
        });
      } else prev = null;
      const sc = scenes[cur];
      title = `${c.pink}◆${c.reset} ${c.white}${c.bold}${name}${c.reset} ${c.grey}·${c.reset} ${c.violet}${sc.label}${c.reset} ${c.grey}· ${metaLine()}${c.reset}`;
      const dots = scenes.map((_, i) => (i === cur ? `${c.pink}●${c.reset}` : `${fg(240)}●${c.reset}`)).join(" ");
      footer = `${dots}  ${foot}`;
    }
    reg.draw(frame(body, { width: W, title, foot: footer }));
  };
  draw();
  const id = setInterval(draw, 80);
  return {
    // only real text takes over (some providers stream empty reasoning deltas)
    reason(t) { reasoning += t; if (phase === "wait" && reasoning.trim()) phase = "think"; },
    write(t) { content += t; if (content.trim()) phase = "write"; },
    stop(summary) { clearInterval(id); reg.clear(); process.stdout.write(summary + "\n"); },
  };
}

// ── scene building blocks ─────────────────────────────────────────────────────────────────────────
const DIGITS = {
  0: ["█▀█", "█ █", "▀▀▀"], 1: ["▀█ ", " █ ", "▀▀▀"], 2: ["▀▀█", "█▀▀", "▀▀▀"], 3: ["▀▀█", " ▀█", "▀▀▀"],
  4: ["█ █", "▀▀█", "  ▀"], 5: ["█▀▀", "▀▀█", "▀▀▀"], 6: ["█▀▀", "█▀█", "▀▀▀"], 7: ["▀▀█", "  █", "  ▀"],
  8: ["█▀█", "█▀█", "▀▀▀"], 9: ["█▀█", "▀▀█", "▀▀▀"], ".": [" ", " ", "▀"], $: ["▄█▀", "▀█▄", "▀█▀"],
};
const big = (s) => [0, 1, 2].map((r) => [...s].map((ch) => DIGITS[ch]?.[r] ?? " ").join(" "));
const sparkline = (hist, n) => {
  const rates = [];
  for (let i = 1; i < hist.length; i++) rates.push(Math.max(0, (hist[i].cost - hist[i - 1].cost) / ((hist[i].t - hist[i - 1].t) / 1000)));
  const r = rates.slice(-n), mx = Math.max(1e-9, ...r);
  return { line: r.map((v) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.round((v / mx) * 7))]).join("").padStart(n, "▁"), now: r[r.length - 1] ?? 0 };
};

// A scrolling window over some lines (the original "what the AI sees").
export const feedScene = (label, lines) => ({
  label,
  render: ({ f, inner, rows }) => {
    if (!lines.length) return [];
    const i = f % lines.length;
    return Array.from({ length: rows }, (_, k) => `${fg(FADE[Math.min(FADE.length - 1, k + FADE.length - rows)] ?? 255)}${fit(lines[(i + k) % lines.length].replace(/\t+/g, " · "), inner)}${c.reset}`);
  },
});

// A big odometer of the money going out, tokens, $/s sparkline. caption(ctx) -> line under it.
export const moneyScene = ({ label = "meanwhile, your money", tokens, caption }) => ({
  label,
  render: (ctx) => {
    const { stats, hist, inner } = ctx;
    const cost = stats().cost, digits = big(`$${cost.toFixed(4)}`);
    const sp = sparkline(hist, 14);
    const right = [
      `${c.grey}tokens ${c.reset}${c.white}${c.bold}${n0(tokens ? tokens(ctx) : stats().tok)}${c.reset}`,
      `${c.grey}$/s    ${c.reset}${c.yellow}${sp.line}${c.reset} ${c.grey}$${sp.now.toFixed(4)}${c.reset}`,
      `${c.grey}time   ${c.reset}${c.white}${ctx.secs.toFixed(1)} s${c.reset}`,
    ];
    const wide = inner >= 70;
    const out = [`${c.grey}Meanwhile, your money:${c.reset}`, ""];
    digits.forEach((d, k) => out.push(`  ${c.yellow}${c.bold}${d}${c.reset}${wide ? `      ${right[k]}` : ""}`));
    if (!wide) out.push(`  ${right[0]}  ${right[1]}`);
    out.push("");
    if (caption) out.push(caption(ctx));
    return out;
  },
});

// One fact per visit, typed in with a blinking cursor. facts: (string | ctx => string)[]
export const factScene = ({ label = "fun fact", heading = "FUN FACT", facts }) => ({
  label,
  render: (ctx) => {
    const k = ctx.visit % facts.length;
    const fact = typeof facts[k] === "function" ? facts[k](ctx) : facts[k];
    const shown = typed(fact, ctx.ms, 42);
    const lines = wrap(shown, Math.max(20, ctx.inner - 6));
    return ["", `  ${c.pink}${c.bold}${heading}${c.reset} ${c.grey}${k + 1}/${facts.length}${c.reset}`, "",
      ...lines.map((l, i) => `  ${c.white}${l}${c.reset}${i === lines.length - 1 ? blink(ctx.ms) : ""}`)];
  },
});

// ── Round A ───────────────────────────────────────────────────────────────────────────────────────
// feed: pasted rows. promptTokens: estimated prompt size. tokens(): live token count. whole: { tokens, ctx,
// maxPct } (the whole Excel vs the model's window; ctx 0 = unknown).
export function pasteScenes({ feed, promptTokens, tokens, whole = null }) {
  const { sheets, seen, all, pct } = sheetStats();
  const reg = sheets.find((x) => /regist/i.test(x.name));
  const regN = reg?.of ?? 7130;
  const round = (n) => Math.round(n / 1000) * 1000;
  const hp = promptTokens / 100_000;   // Harry Potter 1 ≈ 77k words ≈ 100k tokens

  const coverage = {
    label: "what it doesn't see",
    render: ({ ms, inner, rows }) => {
      const nw = Math.min(14, Math.max(...sheets.map((x) => x.name.length)));
      const labW = inner >= 72 ? 22 : 5;
      const bw = Math.max(10, inner - nw - labW - 4);
      const fill = ease(ms / 2600);
      const tick = Math.floor(ms / 140);
      const lines = [`${c.grey}It gets the first ${pct} % of every sheet. The grey is what it never reads:${c.reset}`];
      sheets.slice(0, rows - 2).forEach((x, r) => {
        const s = Math.max(1, Math.round((bw * x.n) / x.of)), unseen = bw - s, drawn = Math.round(unseen * fill);
        let noise = "";
        for (let i = 0; i < drawn; i++) noise += `${fg(236 + (hash(i, r, tick) % 4))}${"░▒·:"[hash(r, i, tick >> 1) % 4]}`;
        const p = ((x.n / x.of) * 100).toFixed(0).padStart(3) + " %";
        const lab = labW > 5 ? `${n0(x.n).padStart(6)} / ${n0(x.of).padEnd(7)}${p}` : p;
        lines.push(`${c.white}${x.name.slice(0, nw).padEnd(nw)}${c.reset}  ${c.pink}${"█".repeat(s)}${noise}${" ".repeat(unseen - drawn)}${c.reset}  ${c.grey}${lab}${c.reset}`);
      });
      const tail = whole?.ctx && whole.ctx < whole.tokens
        ? `Whole Excel ≈ ${(whole.tokens / 1e6).toFixed(1)} M tokens, max window ${(whole.ctx / 1e6).toFixed(1)} M = ~${whole.maxPct} %. Never all.`
        : `${n0(all - seen)} rows never reach the model. It has to guess them.`;
      if (ms > 1800) lines.push(`${c.yellow}${typed(tail, ms - 1800, 60)}${c.reset}`);
      return lines;
    },
  };

  const poll = {
    label: "guess the guess",
    render: ({ ms, inner }) => {
      const opts = [round(regN * 0.56), round(regN * 0.84), regN].map(n0);
      const shown = Math.min(3, Math.floor(ms / 700));
      const optLine = opts.slice(0, shown).map((o, i) => `${c.pink}${c.bold}${"ABC"[i]})${c.reset} ${c.white}${c.bold}${o}?${c.reset}`).join("      ");
      return ["", `  ${c.pink}${c.bold}GUESS THE GUESS${c.reset}  ${c.grey}poll the room${c.reset}`, "",
        `  ${c.white}What will it say for q1, how many people registered?${c.reset}`, "",
        `     ${optLine}`, "", `  ${c.grey}>${c.reset} ${c.white}shout it out${c.reset} ${blink(ms)}`];
    },
  };

  const facts = factScene({
    facts: [
      `This prompt is ~${n0(promptTokens)} tokens: about ${hp < 1.25 ? "one Harry Potter book" : `${hp.toFixed(1)} Harry Potter books`} of spreadsheet.`,
      ({ secs }) => `A for-loop over all ${n0(all || 150000)} rows takes ~0.2 s on your laptop. The AI is at ${secs.toFixed(0)} s and has read ${pct} % of them.`,
      ({ stats }) => `Right now it costs $${stats().cost.toFixed(3)}. Round B solves the same task for about a tenth of that, and gets it right.`,
      "The AI can't run code here. It has to read and guess.",
      `It sees ${n0(seen)} rows. The other ${n0(all - seen)} it has to imagine.`,
    ],
  });

  return [
    feedScene("what the AI sees", feed),
    coverage,
    moneyScene({ tokens, caption: ({ stats }) => `${c.grey}Round B: about a tenth of this. Your laptop's share: ${c.green}$0.0000${c.reset}` }),
    facts,
    poll,
  ];
}

// ── Round B: the writer ───────────────────────────────────────────────────────────────────────────
export function writerScenes({ task, questions }) {
  const edge = (task.match(/## Edge cases[\s\S]*?(?=\n## |$)/)?.[0] ?? "").split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*(where|---)/.test(l)).length;
  const { all, pct } = sheetStats();
  const N = n0(all || 150000);
  const plan = {
    label: "the plan",
    render: ({ ms, f, inner }) => {
      const head = typed(`reading TASK.md · ${edge || "all the"} edge cases · ${questions.length} questions`, ms, 55);
      const lines = [`${c.white}${head}${c.reset}`, ""];
      questions.slice(0, 5).forEach((q, i) => {
        const done = ms > 900 + i * 900;
        const m = done ? `${c.green}✓${c.reset}` : ms > 900 + (i - 1) * 900 ? `${c.pink}${spin(f)}${c.reset}` : `${fg(240)}·${c.reset}`;
        lines.push(`${m} ${done ? c.white : c.grey}${fit(q, inner - 2)}${c.reset}`);
      });
      if (ms > 5400) lines.push(`${c.grey}then your laptop runs it on all ${N} rows${c.reset}`);
      return lines;
    },
  };
  const race = {
    label: "who reads the rows?",
    render: ({ ms, inner }) => {
      const bw = Math.max(10, inner - 46);
      const a = Math.round(bw * (pct / 100) * ease(ms / 4000)), b = Math.round(bw * ease(ms / 350));
      const bar = (k, col) => `${col}${"█".repeat(k)}${fg(237)}${"░".repeat(bw - k)}${c.reset}`;
      const word = Math.floor(ms / 1500) % 3;
      const motto = ["AI writes.", "Code runs.", "AI checks."].map((w, i) => (i === word ? `${c.pink}${c.bold}${w}${c.reset}` : `${c.grey}${w}${c.reset}`)).join(" ");
      return [`${c.grey}Who reads the ${N} rows?${c.reset}`, "",
        `${c.white}Round A${c.reset} ${c.grey}the AI     ${c.reset} ${bar(Math.max(1, a), c.red)} ${c.grey}${pct} %, then guesses${c.reset}`,
        `${c.white}Round B${c.reset} ${c.grey}your laptop${c.reset} ${bar(b, c.green)} ${c.grey}100 % · ~0.2 s · $0${c.reset}`,
        "", `      ${motto}`];
    },
  };
  const facts = factScene({
    heading: "WHILE IT WRITES",
    facts: [
      `The writer never sees the ${N} rows, only the first few lines of each sheet. It doesn't need to: code reads them all.`,
      "A for-loop does not hallucinate. It is boring, and it is exactly right every time.",
      ({ stats }) => `So far $${stats().cost.toFixed(4)}. Running the program afterwards costs $0.0000.`,
      "The tests (verify.mjs) decide right or wrong. Not the model, not a reviewer.",
    ],
  });
  return [plan, race, moneyScene({ label: "the bill", caption: () => `${c.grey}Round A paid to read the sheet. Here: a few hundred lines of code.${c.reset}` }), facts];
}

// ── Round B: the checker ──────────────────────────────────────────────────────────────────────────
export function checkerScenes({ codeLines, wrong }) {
  const scan = {
    label: "review",
    render: ({ secs, inner, rows }) => {
      const n = codeLines.length || 1, body = rows - 1;
      const pos = Math.floor(secs * 7) % n;
      const start = Math.max(0, Math.min(pos - Math.floor(body / 2), n - body));
      const out = [`${c.grey}a second model from another vendor reviews the code · only ${c.yellow}${wrong}${c.reset}`];
      for (let i = start; i < Math.min(n, start + body); i++) {
        const num = String(i + 1).padStart(4);
        if (i === pos) {
          const txt = `${num} ▶ ${plain(codeLines[i])}`;
          out.push(`\x1b[48;5;54m${c.white}${c.bold}${fit(txt, inner).replace(/\x1b\[0m$/, "")}${" ".repeat(Math.max(0, inner - [...txt].length))}\x1b[0m`);
        } else out.push(`${i < pos ? fg(240) : fg(244)}${num} │${c.reset} ${i < pos ? `${fg(242)}${plain(codeLines[i])}${c.reset}` : highlightPy(codeLines[i])}`);
      }
      return out;
    },
  };
  const why = factScene({
    heading: "WHY A SECOND MODEL?",
    facts: [
      "Another vendor, other training data, other blind spots. It catches what the writer can't see in its own code.",
      `It only gets the failing rules (${wrong}). It may not compute any number itself, it points at the bug.`,
      "The tests found the failure. The checker only explains it. Then the writer fixes it and the laptop runs again.",
    ],
  });
  return [scan, why];
}

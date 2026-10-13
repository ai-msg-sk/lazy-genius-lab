// The "Lazy Genius certified" badge: writes my-work/badge.html, opens it in the browser, prints a terminal copy.
// Used by badge.mjs and by compare.mjs (after the finale, only when Round B is 5/5).
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { badgeHTML } from "./badge-template.mjs";
import { box, c, fg, vis } from "./tui.mjs";

const LAB = new URL("../", import.meta.url);
const OUT_DIR = new URL("my-work/", LAB);
const OUT = new URL("badge.html", OUT_DIR);
const REL = "my-work/badge.html";

const argv = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined; };
const envFile = (k) => { try { return readFileSync(new URL(".env", LAB), "utf8").match(new RegExp(`^${k}=(.+)$`, "m"))?.[1].trim(); } catch { return undefined; } };

export const money = (n) => (!n ? "$0" : n >= 0.1 ? `$${n.toFixed(2)}` : `$${Number(n.toPrecision(2))}`);
const secs = (s) => (s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
const big = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);

// Everything the card and the terminal print, as strings.
export function badgeData({ A, B, name, seat }) {
  name = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 18) || null;
  seat = String(seat ?? "").replace(/\D/g, "").slice(-3);
  seat = seat ? seat.padStart(3, "0") : null;
  const x = A.cost && B.cost ? A.cost / B.cost : 0;
  const mult = x >= 10 ? `${Math.round(x)}×` : `${Number(x.toFixed(1))}×`;
  const cheap = x >= 1.5;
  const toks = A.tokens && B.tokens;
  const d = {
    name, seat,
    a: { score: `${A.score}/5`, cost: money(A.cost), time: secs(A.secs), tokens: toks ? `${big(A.tokens)} tokens read` : null, wrong: A.score < 5 },
    b: { score: `${B.score}/5`, cost: money(B.cost), time: secs(B.secs), tokens: toks ? `${big(B.tokens)} tokens` : null },
    big: cheap ? mult : `${B.score}/5`,
    word1: cheap ? "cheaper" : "right,",
    word2: cheap ? "and right." : "every time.",
  };
  d.caption = [
    `Made AI write the math, not do it: ${cheap ? `${mult} cheaper and` : ""} ${B.score}/5 right (pasting the Excel into chat got ${A.score}/5).`.replace("  ", " "),
    `AI writes. Code runs. AI checks.`,
    ``,
    `Lazy Genius certified at #OpenSlava '26 with @msglifeslovakia · workshop partner @elevenlabsio`,
    `#LazyGenius #OpenSlava`,
  ].join("\n");
  return d;
}

export function openInBrowser(file) {
  try {
    const p = process.platform;
    const [bin, args, opts] = p === "darwin" ? ["open", [file], {}]
      : p === "win32" ? ["cmd", ["/c", "start", '""', `"${file}"`], { windowsVerbatimArguments: true }]
      : ["xdg-open", [file], {}];
    const ch = spawn(bin, args, { detached: true, stdio: "ignore", ...opts });
    ch.on("error", () => {});
    ch.unref();
    return true;
  } catch { return false; }
}

// Compact badge for the terminal (screenshot-able).
function terminalBadge(d) {
  const L = fg(183), V = fg(141), A = fg(161), dim = c.grey, b = c.bold, r = c.reset;
  const col = (s, n) => s + " ".repeat(Math.max(0, n - vis(s)));
  const row = (tag, who, x, win) => `${win ? V : dim}${tag}${r}  ${col(`${win ? c.white : dim}${who}${r}`, 19)} ${col(`${win ? c.green : A}${b}${x.score}${r}`, 5)} ${col(`${win ? c.white : dim}${x.cost}${r}`, 8)} ${win ? c.white : dim}${x.time}${r}`;
  return [
    `${c.rasp}●${r}${b}msg${r} ${dim}×${r} ${b}OpenSlava '26${r}     ${dim}workshop partner${r} ${b}ElevenLabs${r}`,
    ``,
    `${c.white}${b}L A Z Y   G E N I U S${r}   ${L}${b}[ CERTIFIED ]${r} ${c.green}${b}✓${r}`,
    d.name || d.seat ? `${dim}${[d.name, d.seat && `seat ${d.seat}`].filter(Boolean).join(" · ")}${r}` : null,
    ``,
    row("Round A", "the AI guessed", d.a, false),
    row("Round B", "the AI wrote code", d.b, true),
    ``,
    `${L}${b}${d.big} ${d.word1} · ${d.word2.replace(/\.$/, "")}${r}`,
    `${c.white}AI writes${c.rasp}.${r} ${c.white}Code runs${c.rasp}.${r} ${c.white}AI checks${c.rasp}.${r}`,
    ``,
    `${dim}14 Oct 2026 · Bratislava${r}`,
    `${L}${b}@msglifeslovakia${r}  ${V}#OpenSlava  #LazyGenius${r}`,
  ].filter((l) => l !== null);
}

// Writes my-work/badge.html, opens it (unless --no-open / LAB_NO_OPEN=1), prints the terminal badge + share box.
export async function showBadge({ A, B, name, seat, open } = {}) {
  name ??= argv("name") ?? process.env.LAB_NAME ?? envFile("LAB_NAME");
  seat ??= argv("seat") ?? process.env.LAB_SEAT ?? envFile("LAB_SEAT");
  open ??= !process.argv.includes("--no-open") && process.env.LAB_NO_OPEN !== "1";
  const d = badgeData({ A, B, name, seat });
  mkdirSync(OUT_DIR, { recursive: true });
  const file = fileURLToPath(OUT);
  writeFileSync(file, badgeHTML(d));
  const opened = open && openInBrowser(file);
  box(terminalBadge(d), fg(141), `${c.bold}LAZY GENIUS CERTIFIED${c.reset}`);
  box([
    `${c.bold}Share it:${c.reset} post the badge to your story and tag ${c.bold}@msglifeslovakia${c.reset} · #OpenSlava`,
    opened ? `Badge opened in your browser ${c.grey}(${REL})${c.reset}` : `Badge saved: ${c.white}${c.bold}${REL}${c.reset} ${c.grey}(open it in your browser)${c.reset}`,
  ], c.pink, `${c.bold}NEXT${c.reset}`);
  return file;
}

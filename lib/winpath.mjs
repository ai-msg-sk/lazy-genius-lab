// Windows installers (winget, the Claude Code installer) write PATH to the registry, but a terminal that is
// already open keeps its old PATH, and so does every program started from it. refreshPath() reads PATH from
// the registry again, so a tool installed a minute ago is found without closing the terminal.
import { spawnSync } from "node:child_process";

const KEYS = ["HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "HKCU\\Environment"];

export function refreshPath() {
  if (process.platform !== "win32") return;
  const read = (key) => {
    const r = spawnSync("reg", ["query", key, "/v", "Path"], { encoding: "utf8", windowsHide: true });
    return (r.stdout || "").match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im)?.[1].trim() ?? "";
  };
  const expand = (s) => s.replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? m);
  const fresh = KEYS.map(read).map(expand).join(";").split(";").map((p) => p.trim()).filter(Boolean);
  const cur = (process.env.Path ?? process.env.PATH ?? "").split(";").filter(Boolean);
  const seen = new Set(cur.map((p) => p.toLowerCase().replace(/\\$/, "")));
  const add = fresh.filter((p) => { const k = p.toLowerCase().replace(/\\$/, ""); return !seen.has(k) && seen.add(k); });
  if (add.length) process.env.Path = [...cur, ...add].join(";"); // process.env is case-insensitive on Windows
}

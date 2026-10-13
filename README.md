# The Lazy Genius Pattern · lab kit

OpenSlava 2026 · Room 2 · 12:00–14:30 · Jakub Novak, msg life Slovakia

> Make AI write the math, not do it.

## Start (2 minutes)

You need **Node.js 18+**. Python 3 helps. Claude Code is optional.

```bash
git clone https://github.com/ai-msg-sk/lazy-genius-lab
cd lazy-genius-lab
node lab.mjs
```

`node lab.mjs` walks you through every step and remembers where you are.

| key | in the lab menu | inside a step |
|---|---|---|
| **↑ ↓** | choose a step | |
| **Enter** | start it | continue / back to the menu |
| **q** | quit (progress is saved) | |
| **o** | | open the file in its app (the Excel, TASK.md) |
| **p** / **f** | | peek at the sheets here / full rules here |

Nothing opens by itself: files open only when you press **o**.

It asks for the **claim code** on your card (e.g. `012-DUNAJ-K7QX`), unlocks your two keys locally,
checks your machine and both keys, and points Claude Code in this folder at key B.
No git? Download the ZIP from the green **Code** button.
On Windows use **PowerShell** or Windows Terminal (not cmd), and clone into `C:\Users\<you>`, not a OneDrive folder. Then read **[TASK.md](TASK.md)**.

| key | budget | use it for |
|---|---|---|
| **A** | $0.50 | Round A: paste the spreadsheet into a chat and ask |
| **B** | $0.50 | Round B: make the AI write code that you run |

Keys die tonight at 23:59. Every request shows up on the burn board on the projector.

## Round A: the way everyone does it

```bash
node 02-paste-into-chat.mjs                       # Gemini Flash, ~250 KB pasted
node 02-paste-into-chat.mjs openai/gpt-6.1-sol    # a reasoning model
```

It saves the answer and runs `verify.mjs` for you. Watch the cost line.

## Round B: lazy genius

Pick one:

- **Claude Code**: run `claude` in this folder and paste:
  > Read TASK.md and CLAUDE.md. Write a Python script that computes the five answers from data/openslava-2026-export.xlsx and writes my-work/answers.json. Run it, then run node verify.mjs, and fix it until it says 5/5.
- **Any other agent** (Cursor, Codex, Aider): use key B with base URL `https://openrouter.ai/api/v1`.
- **No agent**: `node 03-orchestrator.mjs` (Haiku writes Python, your laptop runs it, GPT-6 Luna reviews).

Then `node verify.mjs`. Goal: **5/5 for less than Round A cost you**.

## Allowed models

`anthropic/claude-haiku-5.5` · `anthropic/claude-sonnet-5.5` · `openai/gpt-6-luna-pro` · `openai/gpt-6.1-sol` ·
`google/gemini-3.8-flash` · `deepseek/deepseek-v4.1-flash` · `qwen/qwen3.8-flash` · `mistralai/mistral-small-2603` ·
`z-ai/glm-5.3-flash` · `meta-llama/llama-3.3-70b-instruct`

Sonnet and GPT-6.1 Sol eat $0.50 fast. You have been warned.

## All commands

| command | what it does |
|---|---|
| `node start.mjs` | unlock your keys with the claim code, check your machine |
| `node excel.mjs` | open the Excel and spot 5 traps yourself (5 min) |
| `node task.mjs` | show the assignment (and open TASK.md in your editor) |
| `node 02-paste-into-chat.mjs` | Round A: paste the Excel into an AI and let it guess |
| `claude` / `node 03-orchestrator.mjs` | Round B: let the AI write code |
| `node prompt.mjs` | copy the Round B prompt to your clipboard again |
| `node verify.mjs` | check my-work/answers.json (at 5/5 it shows the A-vs-B finale) |
| `node compare.mjs` | the A-vs-B finale: cost, tokens, time, a year in a real team |
| `node bonus.mjs` | a second export arrives: your Round B program reruns on it for $0 |
| `node feedback.mjs` | rate the workshop (QR code) |
| `node show.mjs` | the 30-second intro loop from the projector |
| `node cleanup.mjs` | delete your keys and everything the lab created |

## Done? Clean up

```bash
node cleanup.mjs
```

Deletes your keys, the Claude Code wiring, your answers and generated code, scans the folder for any leftover key,
and asks whether to delete the whole folder. Your keys stop working tonight at 23:59 anyway.

## Receipts

Everything you make lands in **`my-work/`**: `answers.json`, the Round B programs (`round-b/`), `badge.html`, and `receipts.jsonl` (model, tokens, reasoning tokens, cost and time of every AI call).

```bash
node -e "const r=require('fs').readFileSync('my-work/receipts.jsonl','utf8').trim().split('\n').map(JSON.parse);const by={};for(const x of r){const k=x.tag.split(':')[0];by[k]=(by[k]||0)+x.cost}console.table(by)"
```

## ElevenLabs (workshop partner)

Registered participants get free ElevenLabs access: join the [ElevenLabs Discord](https://discord.com/invite/VnBvbbcdEC),
open `#coupon-codes`, click **Start Redemption**, pick **OpenSlava Workshop** and use the e-mail you registered with.
[Video guide](https://youtu.be/S143_JtCtV8).

## Take home

**Plan → generate code → execute deterministically → verify → only then report.**
Put that rule in your agent's memory (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`).

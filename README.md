# The Lazy Genius Pattern · lab kit

OpenSlava 2026 · Room 2 · 12:00–14:30 · Jakub Novak, msg life Slovakia

> Make AI write the math, not do it.

## Start (2 minutes)

You need **Node.js 18+**. Python 3 helps. Claude Code is optional.

```bash
git clone https://github.com/ai-msg-sk/lazy-genius-lab
cd lazy-genius-lab
node start.mjs
```

It asks for the **claim code** on your card (e.g. `012-DUNAJ-K7QX`), unlocks your two keys locally,
checks your machine and both keys, and points Claude Code in this folder at key B.
No git? Download the ZIP from the green **Code** button. Then read **[TASK.md](TASK.md)**.

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
  > Read TASK.md and CLAUDE.md. Write a Python script that computes the five answers from data/openslava-2026-export.xlsx and writes answers.json. Run it, then run node verify.mjs, and fix it until it says 5/5.
- **Any other agent** (Cursor, Codex, Aider): use key B with base URL `https://openrouter.ai/api/v1`.
- **No agent**: `node 03-orchestrator.mjs` (Haiku writes Python, your laptop runs it, GPT-6 Luna reviews).

Then `node verify.mjs`. Goal: **5/5 for less than Round A cost you**.

## Allowed models

`anthropic/claude-haiku-5.5` · `anthropic/claude-sonnet-5.5` · `openai/gpt-6-luna-pro` · `openai/gpt-6.1-sol` ·
`google/gemini-3.8-flash` · `deepseek/deepseek-v4.1-flash` · `qwen/qwen3.8-flash` · `mistralai/mistral-small-2603` ·
`z-ai/glm-5.3-flash` · `meta-llama/llama-3.3-70b-instruct`

Sonnet and GPT-6.1 Sol eat $0.50 fast. You have been warned.

## Receipts

Every call is logged in `runs.jsonl` (model, tokens, reasoning tokens, cost, latency).

```bash
node -e 'const r=require("fs").readFileSync("runs.jsonl","utf8").trim().split("\n").map(JSON.parse);const by={};for(const x of r){const k=x.tag.split(":")[0];by[k]=(by[k]||0)+x.cost}console.table(by)'
```

## ElevenLabs (workshop partner)

Registered participants get free ElevenLabs access: join the [ElevenLabs Discord](https://discord.com/invite/VnBvbbcdEC),
open `#coupon-codes`, click **Start Redemption**, pick **OpenSlava Workshop** and use the e-mail you registered with.
[Video guide](https://youtu.be/S143_JtCtV8).

## Take home

**Plan → generate code → execute deterministically → verify → only then report.**
Put that rule in your agent's memory (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`).

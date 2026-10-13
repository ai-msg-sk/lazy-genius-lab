# Lazy Genius rules

This folder is a lab about making AI write the math, not do it. The task is in TASK.md,
the data in data/openslava-2026-export.xlsx (~150k rows; never read it whole into context,
use data/preview.txt to see the layout).

- Never compute a number in your head or in prose. Write a script, run it, report its output.
- Prefer one small deterministic script over many tool calls. Re-run, don't re-reason.
- Money is integer cents. Parsing rules come from TASK.md, not from guesses.
- Before trusting a result, test the edge cases TASK.md lists (duplicates, badge formats, star formats, rating time, storno/TEST, back-to-back bookings).
- When you report a number, say which command produced it.
- Write answers.json and run `node verify.mjs`. Do not try to reverse the hashes in answers.hashes.json.
- Budget is $0.50: keep context small, don't paste data into the conversation.

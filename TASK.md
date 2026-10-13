# The assignment: OpenSlava closing report

It's 9:00 the morning after the conference. The organizers need **five numbers**
for the closing report and the sponsors call at 10:00.

All you have is the ops export everyone dumped into one Excel:

`data/openslava-2026-export.xlsx` · 6 sheets · ~150,000 rows · nobody cleaned it.

| sheet | what's in it | what's wrong with it |
|---|---|---|
| Program | talks, rooms, times | title rows above the header, notes below |
| Registrácie | ticket sign-ups | same people registered 2–3×, emails in random case/with spaces |
| Vstupy | badge scans at the gates | badge is sometimes a reg ID, sometimes an email; guests and staff mixed in |
| Hodnotenia | talk ratings + comments | stars as `4`, `4/5`, `4,0`, `★★★★☆`, `n/a`; talks by ID or by title (any case) |
| Catering | coffee, food, bar | prices as `3,40 €`, `€3.40`, `3.4`; storno rows; test transactions |
| Office planning | room bookings for the whole year | rooms in random case, statuses in 3 languages |

## The five numbers

Write `answers.json`:

```json
{
  "q1_unique_registered_people": 0,
  "q2_people_who_showed_up": 0,
  "q3_winning_talk_id": "T00",
  "q4_catering_revenue_2026_10_14_eur": "0.00",
  "q5_double_booked_room_pairs": 0
}
```

**q1** How many different people registered? A person is an e-mail address (trimmed, case-insensitive).

**q2** How many of them actually came? A person came if any scan in *Vstupy* belongs to them.
A badge belongs to a person if it is one of their `reg_id`s, or their e-mail (trimmed, case-insensitive).
Anything else (GUEST-…, STAFF-…, unknown e-mails) is nobody.

**q3** Which talk won the audience award? A rating counts only if:
- its stars parse to a whole number 1–5 (`4`, `4/5`, `4,0`, count of `★`); anything else is ignored,
- it belongs to a registered person who has a scan **on the day of that talk**,
- it was sent on the talk's day, **at or after the talk ended** (rating during the talk = fake),
- it is that person's **latest** valid rating for that talk (people resubmit).

Score each talk with a Bayesian average: `score = (C·m + sum) / (C + n)`, where `C = 50`,
`m` = mean of all counted ratings over all talks, `sum` and `n` = that talk's counted ratings.
Answer the talk ID with the highest score.

**q4** Catering revenue on 14 October 2026 in EUR: sum of `Ks × Cena/ks` for rows timestamped that day,
storno rows included (they have negative `Ks`), stand `TEST` excluded. Two decimals.

**q5** How many pairs of **confirmed** room bookings overlap in time in the same room?
Booking rows have `Typ` Rezervácia/rezervacia/Booking. Confirmed = `Stav` is Potvrdené/potvrdene/CONFIRMED/OK (any case).
Room names are compared trimmed and case-insensitive. Back-to-back bookings (one ends 10:00, next starts 10:00) do **not** overlap.

`data/preview.txt` shows the first rows of every sheet. An `.xlsx` is a zip of XML files:
Python's standard library (`zipfile`, `xml`) reads it with no installs; `openpyxl`/`pandas` or Node's `xlsx` package work too.

Timestamps come as `14.10.2026 09:05:07`, `2026-10-14T09:05:07`, `4.3.2026 9:30` or `2026-03-04 09:30`.

## Check

```bash
node verify.mjs
```

It knows only hashes of the right answers: it tells you right/wrong per question, nothing more.

## Two rounds, two keys

- **Round A (key A):** do it the way most people do. Paste the data into a chat
  (`node 02-paste-into-chat.mjs`, or any chatbot you like) and ask for the five numbers.
- **Round B (key B):** make the AI **write code**, run it on your laptop, verify. Same $0.50.

The burn board on the projector shows A vs. B spend per seat.

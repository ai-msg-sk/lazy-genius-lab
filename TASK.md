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

Write `my-work/answers.json`:

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

## Edge cases (the traps in the data, and how to treat them)

| where | case | rule |
|---|---|---|
| Registrácie | same person registered 2–3× with different `reg_id`s | one person = one e-mail |
| Registrácie, Vstupy | e-mail in UPPER/Mixed case or with spaces around it | lowercase + trim only (there are no spaces inside addresses) |
| Vstupy, Hodnotenia | badge is a `reg_id` (`R01234`) of any of the person's registrations | belongs to that person |
| Vstupy, Hodnotenia | badge is `GUEST-…`, `STAFF-…` or an e-mail nobody registered with | belongs to nobody, ignore |
| Program | title rows above the header, empty row and a note below the talks | only rows whose `ID` looks like `T07` are talks |
| Hodnotenia | talk given as ID (`T07`) or as title in any case, maybe with a trailing space | match ID exactly, title trimmed + case-insensitive |
| Hodnotenia | stars `4` (text or number), `4/5`, `4,0`, `★★★★☆` | 4 (count the `★`) |
| Hodnotenia | stars empty, `n/a`, `-`, `neviem` | ignore the rating |
| Hodnotenia | rating sent before the talk ended, or on another day | ignore (fake) |
| Hodnotenia | rating from a registered person with no scan that day | ignore |
| Hodnotenia | same person rated the same talk several times | keep only the latest valid one (same second: the lower row wins) |
| Hodnotenia | a talk with very few ratings, all 5★ | that's why it's Bayesian, not a plain average |
| Catering | `3,40 €`, `€3.40`, `3.40`, `3.4` (text or number) | 3.40 EUR; work in cents |
| Catering | `STORNO – …` rows with negative `Ks` | include them (they subtract) |
| Catering | stand `TEST` (some on 13 Oct, some on 14 Oct) | exclude |
| Catering | timestamps in both formats | day = the date part, 2026-10-14 only |
| Office planning | `Typ` Úloha / Dobrovoľník / Task | not a booking, ignore |
| Office planning | `Stav` Zrušené / zrusene / Návrh / draft / cancelled | not confirmed, ignore |
| Office planning | room `Tatry`, `tatry`, `TATRY`, `Tatry ` | same room; empty room = ignore |
| Office planning | booking 09:00–10:00 and 10:00–11:00 | touching, **not** overlapping |
| Office planning | three bookings that all overlap each other | 3 pairs (count every overlapping pair) |

Bookings never cross midnight. All times are local; no time zones.

## Check

```bash
node verify.mjs
```

This is the test: it knows only hashes of the right answers and tells you right/wrong per question, nothing more.
A reviewer model can be wrong; `verify.mjs` can't.

## Two rounds, two keys

- **Round A (key A):** do it the way most people do. Paste the data into a chat
  (`node 02-paste-into-chat.mjs`, or any chatbot you like) and ask for the five numbers.
- **Round B (key B):** make the AI **write code**, run it on your laptop, verify. Same $0.50.

Write both scores and costs on your sheet. We compare at 14:15.

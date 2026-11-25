---
name: ux-writing
description: Voice, tone and copy patterns for every word in the product — buttons, empty states, errors, toasts, confirmations, notifications, PIN sign-in and approvals, factual exception and leakage copy, the owner's daily report, import errors, emails, SMS and WhatsApp guest messages (confirmation, pre-arrival, in-stay, post-stay), with Nigerian context. Use when writing or reviewing any user-facing text.
---

# UX writing

## Voice
Clear, warm, professional. Like a capable colleague at the desk, not a robot or a salesperson. To guests: the courtesy of a good Nigerian hotel, never stiff. Nigerian English spelling and usage (e.g. "cheque", "colour", "check-in", "folio", "city ledger", "NEPA", "generator"). No slang, no exclamation marks except for genuine celebrations ("Your first property is set up!", "Night audit complete for 25 Nov 2026!").

## Rules
1. **Say what happened, then what to do.** "Payment couldn't be recorded. Check the transfer reference and try again."
2. **Specific over generic.** "No Deluxe rooms left for 26–28 Nov. 2 Executive rooms are free." — never "An error occurred".
3. **Verbs on buttons**, naming the object: "Check in", "Take payment", "Post to room", "Mark clean", "Run night audit", "Send to kitchen". Never "Submit", "OK" or "Yes".
4. **Confirm with consequences:** title asks, body explains, button repeats the action and amount. "Void ₦12,500 Jollof rice on Room 204? The charge stays on the folio as a reversal with your name and reason." → "Void charge".
5. **Sentence case** everywhere. Numbers as digits. Money always with its currency: `₦125,000.00`, `$85.00` (or `₦12.5M` in compact stats), with the NGN equivalent beside foreign amounts. Dates as `25 Nov 2026`, stays as `25–28 Nov 2026 · 3 nights`.
6. **Short:** buttons 1–3 words, toasts under 8 words, errors under 2 sentences.
7. **Domain terms** from `docs/DOMAIN.md` only. Never show internal codes, ids or technical errors.
8. **Never blame the guest — or the user.** "That date is before the arrival date" — not "You entered an invalid date". To guests: "We couldn't confirm your payment yet" — not "Your payment failed". A declined card, a late arrival or a dispute is handled privately and politely.
9. **Respect money and privacy.** Balances, ID and passport numbers, blacklist reasons and notes are shown only to staff who are authorised, and never in a guest-facing message beyond their own folio. ID numbers are always masked (`A0•••••12`).
10. **Business date, not the clock.** In staff copy, "today" means the business date; say so when it differs ("Business date is still 25 Nov 2026. Night audit hasn't run.").
11. **Offline is normal, not an error.** "You're offline. Check-ins and charges are saved and will sync when you're back." Never "Network error".
12. **Exceptions are facts, never accusations.** Leakage copy states what the system saw, who was on record, when and how much — and stops there. "Room 214 found vacant at 10:00; shown occupied since 23 Nov (Chidi)" — never "Chidi hid a guest", "suspicious", "fraud", "theft" or "caught". Variances are neutral: "Cash ₦4,500 short", "Cash ₦2,000 over", not "missing money". The owner draws conclusions; the product doesn't.

## Patterns
| Situation | Pattern | Example |
|---|---|---|
| Empty state | What this is + why it's empty + one action | "No rate plans yet. A rate plan sets the price and conditions for a room type." → "New rate plan" |
| Filtered empty | Say so + clear | "No reservations match these filters." → "Clear filters" |
| Success toast | Past tense, object | "Ada Obi checked in to Room 204" / "₦45,000 posted to Room 312" |
| Undo toast | Action + Undo | "Room 204 marked clean · Undo" |
| Field error | What's needed | "Enter the guest's passport number" / "Enter the FX rate and its source" |
| Availability | Facts + alternative | "Fully booked for 26 Nov. Overbooking limit reached." / "3 Standard rooms left" |
| Folio balance | Amount + what's next | "Balance ₦185,000 · Take payment or transfer to Acme Energy's city ledger" |
| Housekeeping | Room, status, who | "Room 204 · dirty · assigned to Blessing" / "Inspection failed: bathroom not restocked" |
| Night audit | What's blocking, one action each | "3 arrivals not checked in · 1 open bar check · Cash variance at front desk shift 2" |
| Work order / OOO | What, where, until when | "Room 118 out of order until 28 Nov 2026 · AC not cooling" |
| Sensitive action | Ask for the reason inline | "Reason for discount" (required) — "Recorded with your name." |
| Loading (long) | What's happening | "Running night audit for 25 Nov 2026…" / "Syncing 14 offline changes…" |
| Permission denied | What and who | "Only a front office manager can move a room after night audit. Ask your GM." |
| Over limit | Fact + limit + who can approve | "15% is over your 10% discount limit. A GM can approve it here." → "Ask for approval" |
| Approval prompt | Action, amount, requester | "Approve 15% discount on Room 204 for Ada Obi? Requested by Chidi · Reason: repeat corporate guest" → "Approve discount" |
| Self-approval | Plain rule | "You can't approve your own discount. Ask another manager." |
| PIN sign-in | Short, calm | "Enter your PIN" / "That PIN didn't match. Try again." / "Too many tries. Try again in 5 minutes." / "Signed out after 2 minutes idle" |
| Blind count | What to do, not what's expected | "Count the cash in the drawer and enter the total." → "Submit count", then "Expected ₦182,500 · Counted ₦178,000 · ₦4,500 short. Add a reason." |
| Room discrepancy | Room, both statuses, time, names | "Room 118 · shown vacant, found used at 16:00 (attendant: Blessing). Resolve with a reason." |
| Exception | What, who, amount, reason | "Void after ticket sent · Bar · ₦18,000 Hennessy VS · Emeka · Reason: guest changed order · Approved by Funmi" |
| Unmatched payment | Fact + age + next step | "Transfer of ₦250,000, ref 2026112512, not matched to a bank line for 3 days. Match or mark as query." |
| Import errors | Row, field, fix | "Row 14: arrival date 31/02/2026 isn't a real date. Fix it in the file or skip the row." / "212 rows ready, 3 to fix" |

## Owner's daily report
Sent after night audit by WhatsApp and email, one page, readable in 30 seconds on a phone. Order: property and business date, the numbers (occupancy, ADR, revenue, cash collected), then exceptions grouped by type with counts, each with names and amounts, then a link to the full list. No adjectives, no alarm words, no emoji. If there are no exceptions, say so plainly.
- WhatsApp example: "Vento Hotels Ikoyi · 25 Nov 2026: Occupancy 78% (47 of 60) · ADR ₦92,400 · Revenue ₦5.1M · Cash collected ₦1.2M. Exceptions (4): 2 discounts above 10% (Chidi, approved by Funmi) · 1 cash variance ₦4,500 short (shift 2, Emeka) · 1 room discrepancy resolved (Room 118). Full report: {link}"
- Nothing to report: "No exceptions for 25 Nov 2026."

## Messages to guests (WhatsApp, SMS, email)
- Start with who it's from: "Vento Hotels Ikoyi: …" (use the property's name, not the group's, unless it's a group booking).
- One purpose per message. Dates, room type and amount (with currency) in the first lines, a clear next step, and a link to the guest app.
- Include what Nigerian guests actually need: the address with a landmark, check-in time, how to pay (transfer details or link), and the front desk WhatsApp number. Mention generator/24-hour power only where the hotel advertises it.
- Address guests by first name or title as they booked ("Mr Okafor", "Dr Bello"). Never mention balances owed by a company to the guest.
- SMS ≤ 160 characters. WhatsApp follows approved template wording; marketing only with consent.
- Booking confirmation example: "Vento Hotels Ikoyi: Hello Ada, your booking is confirmed. Deluxe King, 25–28 Nov 2026 · 3 nights, ₦375,000 incl. taxes. Confirmation VH-10482. Manage your booking: {link}"
- Deposit request example: "Vento Hotels Ikoyi: Hello Ada, to guarantee your room for 25 Nov, please pay a deposit of ₦125,000 to {bank_name} {account_number} ({account_name}) with reference VH-10482, or online: {link}. Thank you."
- Pre-arrival example: "Vento Hotels Ikoyi: Hello Ada, we look forward to welcoming you tomorrow, 25 Nov. Check-in is from 2pm at 12 Bourdillon Rd, opposite Ikoyi Club. Save time at the desk by checking in online: {link}. Questions? WhatsApp us on +234 801 234 5678."
- Room ready example: "Vento Hotels Ikoyi: Hello Ada, your room is ready. Room 204 on the 2nd floor. Please collect your key at the front desk."
- Foreign guest example: "Vento Hotels Abuja: Hello James, your booking is confirmed. Executive Suite, 3–6 Dec 2026 · 3 nights, $540.00 incl. taxes. Please bring your passport for registration. Airport pickup can be arranged: {link}"
- Payment not received example (never blame): "Vento Hotels Ikoyi: Hello Ada, we haven't yet received the deposit for your 25 Nov booking. If you've already paid, please reply with the transfer receipt and we'll confirm it. {link}"
- Post-stay example: "Vento Hotels Ikoyi: Thank you for staying with us, Ada. Your receipt: {link}. We'd love to hear how we did: {review link}"

# A guest's stay

## Who, goal, device, stage
- **Who:** Ms Sarah Collins, British, booking Lekki Bay Hotel direct. Staff she meets: Chiamaka Eze (front desk, morning), Blessing Udo (room attendant), Emeka's colleagues in room service (Coral kitchen), Tunde Bello (GM, sees reviews).
- **Goal:** book 3 nights in a Deluxe room with breakfast, arrive with as little desk time as possible, get what she needs during the stay from her phone, and leave with a correct invoice.
- **Device:** her own phone (iPhone, Safari) on mobile data and hotel Wi-Fi. No install: booking engine and guest app are mobile web. Staff use the front desk PC and POS tablets.
- **Stage:** 4 (Distribution & guests), with room service from stage 3.
- **Screens:** 9 (booking engine), 17 (guest app), 43 (message templates and log), 30 (arrivals), 6 (check-in), 37 (guest requests queue), 11 (POS and kitchen display for room service), 7 (folio and check-out), 31 (modify and cancel dialogs), 21 (A4 invoice), 34 (deposits held), 20 (leakage: refunds).

**Prices.** The demo seed fixes BAR Deluxe at ₦120,000 room only; it does not fix the Bed & Breakfast price. This walkthrough uses **₦135,000 per night** for Deluxe BAR Bed & Breakfast as an illustrative seed value. Tax lines use configuration; for illustration: service charge 10%, VAT 7.5% and Lagos consumption tax 5% on the room rate. Tests must read rates from configuration.

| Per night | Amount |
|---|---|
| Deluxe · BAR Bed & Breakfast | ₦135,000.00 |
| Service charge 10% | ₦13,500.00 |
| VAT (illustrative 7.5%) | ₦10,125.00 |
| Lagos consumption tax (illustrative 5%) | ₦6,750.00 |
| **Total per night** | **₦165,375.00** |

Cancellation policy and deposit rule (illustrative, set on the rate plan): deposit of the first night; free cancellation until 48 hours before 14:00 on the arrival day, then the first night is charged.

## The walkthrough

1. **Search and choose (Wed 25 Nov 2026, 21:10 UK time).**
   - *Does:* opens the Lekki Bay booking site from the hotel's Instagram link, picks 9–12 Dec 2026, 1 adult.
   - *Sees:* "9–12 Dec 2026 · 3 nights". Room types with photos: Standard from ₦85,000, Deluxe from ₦108,000 (Non-refundable), Executive Suite from ₦210,000, each "per night + taxes and service charge". Under Deluxe: Non-refundable ₦108,000 room only, BAR ₦120,000 room only, BAR Bed & Breakfast ₦135,000. Each shows the 3-night total with taxes and service charge broken out, and the cancellation policy in one line.
   - *Behind the scenes:* availability and prices come from the same rate and inventory data the front desk and channels use. Nothing is held yet.

2. **Details and deposit by card (21:14).**
   - *Does:* picks Deluxe BAR Bed & Breakfast, enters name, email, phone (+44 7700 900123), ticks WhatsApp for messages, taps **Pay deposit ₦165,375.00**.
   - *Sees:* the total: 3 × ₦135,000.00 = ₦405,000.00, service charge ₦40,500.00, VAT ₦30,375.00, consumption tax ₦20,250.00, **total ₦496,125.00**; deposit now ₦165,375.00, balance at the hotel ₦330,750.00. Note: "Charged in naira (NGN). Your bank sets the rate it uses." Then the Paystack checkout, where she enters her card.
   - *Behind the scenes:* in one locked transaction the reservation is created `tentative` (source `booking_engine`) and one Deluxe room is taken from inventory for 9, 10 and 11 Dec, for a short hold window. The deposit amount is computed on the server from the rate plan's deposit rule. Card details go only to Paystack; we keep the reference and, if offered, a token. The cancellation policy is stored on the reservation as accepted.

3. **Confirmation on WhatsApp (21:15).**
   - *Behind the scenes:* we never trust the redirect alone: Verify Transaction confirms status, amount in kobo (16537500), currency NGN and reference; the webhook is idempotent. The reservation becomes `confirmed`, the deposit is recorded against business date 25 Nov 2026 and shows in **Deposits held**. ARI is pushed to channels with one fewer Deluxe room for those dates.
   - *Sees:* on screen and on WhatsApp: "Lekki Bay Hotel: Hello Sarah, your booking is confirmed. Deluxe room, 9–12 Dec 2026 · 3 nights, breakfast included. Deposit paid ₦165,375.00; balance ₦330,750.00. Manage your booking and check in online: {link}." The same by email. The message is logged against her profile (screen 43).

4. **She extends by a night (Tue 1 Dec, 08:30).**
   - *Does:* opens the guest app from the link, **Change dates**, moves departure to 13 Dec.
   - *Sees:* "9–13 Dec 2026 · 4 nights. New total ₦661,500.00 (was ₦496,125.00), difference ₦165,375.00. Deposit stays ₦165,375.00." She confirms.
   - *Behind the scenes:* in one transaction, with the room-type inventory row for 12 Dec locked, the server checks Deluxe availability for the added night, re-prices the added night at today's rate for 12 Dec, and updates the stay. The original nights keep their booked rates. ARI push. Audit event `reservation.modified` with source `guest_app`. New confirmation on WhatsApp.

5. **Pre-check-in (Mon 7 Dec, 19:00).**
   - *Does:* the pre-arrival WhatsApp arrives two days before with the hotel address and landmark and a check-in link. She uploads a photo of her passport, adds visa details, "arriving from London", "next destination: Abuja", and arrival time 14:00.
   - *Sees:* passport number shown masked ("•••••4821"), "Pre-check-in done. Show this at the desk."
   - *Behind the scenes:* the image goes to the private bucket via a short-lived signed URL; the passport number is encrypted at rest. Foreign national fields fill the registration record. Arrivals (screen 30) shows her with "Pre-checked-in · ETA 14:00".

6. **Room ready (Wed 9 Dec, 13:20).**
   - *Behind the scenes:* Blessing cleans room 212 (Deluxe, floor 2); Grace passes inspection at 13:20; Chiamaka assigns 212 to Ms Collins.
   - *Sees:* "Lekki Bay Hotel: Hello Sarah, your room is ready. Room 212 on the 2nd floor. Please collect your key at the front desk."

7. **Express check-in at the desk (14:05).**
   - *Does:* Chiamaka opens her arrival, checks the passport against the uploaded photo, prints the registration card with the foreign national section, Sarah signs it. Key issued.
   - *Sees (Chiamaka):* everything pre-filled; the deposit already on the reservation; balance due ₦496,125.00 to settle by departure (4 nights ₦661,500.00 − deposit).
   - *Behind the scenes:* reservation `confirmed → checked_in`; room 212 `occupied`; the deposit moves to her folio as a payment. No further authorisation taken (see Open questions). Audit events for check-in and key issued.

8. **Requests: towels and late check-out (Thu 10 Dec, 08:15).**
   - *Does:* in the guest app, **Requests → Extra towels**, then **Late check-out → 15:00 on Sun 13 Dec**.
   - *Sees:* "Requested 08:15", then "On the way · Blessing" at 08:19, "Done" at 08:31. Late check-out: "Waiting for the front desk", then "Approved until 15:00" at 09:02.
   - *Behind the scenes:* both land on the guest requests queue (screen 37) with response-time targets. Towels go to housekeeping and are assigned to Blessing on her phone; late check-out goes to the front desk, where Chiamaka approves it. No fee charged this time (see Open questions).

9. **Room service (Thu 10 Dec, 20:10).**
   - *Does:* **Order food**, picks Jollof rice with chicken (₦9,500) and Chapman (₦4,000), notes "less pepper".
   - *Sees:* subtotal ₦13,500.00, service charge ₦1,350.00, VAT ₦1,012.50, consumption tax ₦675.00, **₦16,537.50 to your room**. Then "Being prepared", "On the way".
   - *Behind the scenes:* the order becomes a POS check in the room service outlet, a ticket on the kitchen display, and on delivery posts to her folio on business date 10 Dec 2026 with tax lines.

10. **Live folio (Sat 12 Dec, 22:00).**
    - *Sees:* room and breakfast for 9, 10 and 11 Dec (each posted by night audit on that business date, with tax lines), room service, the deposit, and "Balance ₦347,287.50 as of 22:00". Night 12 Dec is shown as "Posts tonight".

11. **Pays the balance online (Sun 13 Dec, 10:30).**
    - *Does:* **Pay balance**.
    - *Sees:* "₦512,662.50" (4 nights ₦661,500.00 + room service ₦16,537.50 − deposit ₦165,375.00), and below it "About £262.90 at ₦1,950.00 = £1 (CBN official rate, 13 Dec 2026). You will be charged in naira; your bank's rate may differ." The FX rate here is illustrative.
    - *Behind the scenes:* Paystack charges NGN only. On verified success a `card_online` payment posts to her folio, with the FX rate, source and date stored beside the GBP indication. Balance re-checked at posting; any overpayment stays as a credit.

12. **Invoice and departure (14:45).**
    - *Does:* downloads the invoice in the app; leaves the key at the desk.
    - *Sees:* A4 PDF invoice with each night, room service, tax lines, payments and "Balance ₦0.00"; same PDF sent on WhatsApp.
    - *Behind the scenes:* Chiamaka's colleague checks her out: stay `checked_out`, room 212 `vacant` + `dirty`. The invoice is stored with a content hash so a reprint is the same document.

13. **Review request (Mon 14 Dec, 11:00).**
    - *Sees:* "Lekki Bay Hotel: Thank you for staying with us, Sarah. How was your stay? {link}". She gives 5 stars and writes a line; Tunde sees it on his home screen.

### Alternative path: she cancels inside the penalty window
Instead of step 4, on **Tue 8 Dec at 10:00** (28 hours before arrival) she taps **Cancel booking** in the guest app.
- *Sees:* "Free cancellation ended on 7 Dec 2026 at 14:00. If you cancel now, the first night (₦165,375.00) is charged. You paid ₦165,375.00, so no refund is due." She confirms with a reason from a short list.
- *Behind the scenes:* in one locked transaction the reservation becomes `cancelled` and the Deluxe room is returned to inventory for 9, 10 and 11 Dec; ARI push. The penalty posts as a charge using the policy stored at booking; refundable = paid − penalty = ₦0.00. Had she paid more (for example a full prepayment), the difference would be refunded through Paystack with our own reference, needing a member with `refund` permission and a reason (see Open questions). The cancellation shows in the no-shows and cancellations report; WhatsApp and email confirm it.

## What can go wrong
- **Hold expires before she pays:** inventory is released; if Paystack later confirms a late payment, it goes to the reconciliation queue: re-book if a Deluxe room is still free, otherwise refund.
- **Card declined:** "Your card was declined. Try another card or pay by bank transfer." The hold stays until its window ends.
- **No Deluxe room on 12 Dec when she extends:** "Deluxe is full on 12 Dec 2026." Options shown: a Standard or Executive Suite for that night at its price, or keep her dates. Nothing is changed until she confirms.
- **Passport image unreadable or wrong person:** the desk asks for the passport at check-in; pre-check-in is not a substitute for checking ID.
- **Arrives before the room is ready:** she sees "We'll message you when room 212 is ready" and can leave luggage; the arrival shows "Waiting for room" at the desk.
- **Request not picked up in time:** it turns overdue on the queue and the supervisor is notified.
- **Online payment fails at check-out:** the folio stays open; she can pay at the desk by card, transfer or POS terminal.
- **Paystack webhook arrives twice or before the redirect:** unique on reference and event; recorded once.
- **Internet down at the hotel during her stay:** guest app actions hit the server over her mobile data; staff screens queue offline and pick up requests when back.

## Targets
- Booking engine: dates to confirmed booking in under 2 minutes and 5 screens or fewer; page loads under 1 second on a mid-range phone.
- Confirmation message within 1 minute of payment verification.
- Pre-check-in under 3 minutes. Express check-in at the desk under 2 minutes.
- Request visible on the staff queue within 5 seconds of submission.
- Pay balance in 3 taps after Paystack checkout.

## Becomes tests
`apps/web/e2e/journeys/guest-stay.spec.ts`, with Paystack in test mode and a fake WhatsApp provider:
- Search 9–12 Dec shows Deluxe rate plans with taxes and service charge as separate lines and a correct 3-night total.
- Booking creates a `tentative` reservation holding inventory; verified payment makes it `confirmed` with a deposit of the first night on business date 25 Nov 2026; no card fields exist in our DOM or requests.
- A WhatsApp confirmation is logged with the right merge fields.
- Extending to 13 Dec re-checks availability under lock, prices only the added night, and fails cleanly when Deluxe is full on 12 Dec.
- Pre-check-in stores the passport in the private bucket; the number is masked everywhere in the UI.
- Room-ready message sends when 212 becomes `inspected` and is assigned.
- Towel and late check-out requests appear on the staff queue; status changes show in the guest app.
- Room service order creates a POS check and kitchen ticket and posts ₦16,537.50 (from configuration) to her folio.
- Balance payment shows the NGN amount, a GBP indication with rate, source and date, and posts a `card_online` payment; balance becomes ₦0.00.
- Invoice PDF lists tax lines and payments.
- Cancellation inside the window charges the first night from the stored policy, refunds ₦0.00, releases inventory and is listed in the cancellations report.

## Open questions
- **Foreign-currency settlement** (open in `DOMAIN.md`): do we offer settlement in GBP at all, or only show a GBP indication on an NGN charge? Paystack here is NGN only. Which rate is shown: CBN official, or a market rate flagged as such?
- **Bed & Breakfast price** for the demo seed: a fixed rate, or BAR plus a breakfast supplement per person?
- **Deposit rule and cancellation window** for the seeded rate plans (first night vs %; 48 hours vs another window).
- **Extra deposit on modification:** when she adds a night, do we ask for more deposit or leave it to the balance?
- **Guest self-service limits:** can a guest change dates or cancel in the guest app without staff, and up to what point (e.g. not after arrival day)?
- **Refunds triggered by the guest:** a refund needs a member with the `refund` permission and a reason. Does a guest cancellation create a refund request for a GM approval, or an automatic refund within policy?
- **Tax on the cancellation penalty:** does the penalty carry VAT, consumption tax and service charge?
- **Authorisation at check-in** for incidentals when the guest pays by card online: card token through Paystack, cash deposit, or none?
- **Late check-out fee:** free within a window, a fixed fee, or a half-day rate?
- **Review collection:** our own form, or a link to TripAdvisor or Google; and whether the review request needs marketing consent.

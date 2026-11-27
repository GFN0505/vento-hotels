# User walkthroughs

Real people doing real work in Vento, step by step. Each walkthrough ties screens, rules and edge cases together, so we can see where a flow is clumsy before we build it.

They are used for:
- **Specs:** the product-manager writes stage specs from them.
- **Design reviews:** walk the designs through them screen by screen.
- **End-to-end tests:** each walkthrough becomes a Playwright journey in `apps/web/e2e/journeys/`.
- **Training and sales demos:** they run on the demo seed (`pnpm db:seed`).

When a feature changes how someone works, update the walkthrough in the same change.

## The walkthroughs

Start with [the golden thread](00-golden-thread.md): it follows Mr Mensah's Acme stay through all ten modules and shows how they connect before you read any single role's walkthrough.

All walkthroughs describe the same day, 25 Nov 2026, at Kora Victoria Island, so the same rooms, guests and money carry across them.

| Walkthrough | Who | First works | Complete at |
|---|---|---|---|
| [Golden thread: Mr Mensah's Acme stay](00-golden-thread.md) | Everyone | Stage 1 | Stage 6 |
| [Front desk morning](front-desk-morning.md) | Front desk agent | Stage 1 | Stage 2 (room checks, work orders) |
| [Night audit](night-audit.md) | Front desk agent on the night shift | Stage 1 | Stage 5 (ledger posting) |
| [Owner's morning](owner-morning.md) | Owner / MD | Stage 1 | Stage 6 (group home) |
| [Going live](going-live.md) | Hotel GM and Vento onboarding | Stage 1 | Stage 5 (ledger opening balances) |
| [Room attendant's shift](room-attendant-shift.md) | Room attendant and supervisor | Stage 2 | Stage 2 |
| [Dinner service with a power cut](waiter-dinner-service.md) | Waiter, cashier, F&B manager | Stage 3 | Stage 3 |
| [A guest's stay](guest-stay.md) | Guest (booking engine and guest app) | Stage 4 | Stage 4 |

A journey's e2e test grows with the stages: steps that need a later stage are skipped (`test.fixme`) until that stage lands.

## The demo world
All walkthroughs use the demo seed, so names and numbers match across documents, tests and the designs in `docs/design/export/`. Everything here is made up. The demo world follows the Claude Design export; when the two disagree, change the walkthroughs, not the designs.

- **Organization:** Kora Hotels Group (4 properties, 382 rooms).
- **Companies (entities)**, as in the designs (Settings › Companies), all VAT registered:

  | Company | RC number | TIN | Owns |
  |---|---|---|---|
  | Kora Hospitality Ltd | RC 1184402 | 21847390-0001 | Kora Victoria Island, Kora Ikeja GRA |
  | Kora Hotels Abuja Ltd | RC 1290517 | 22910455-0001 | Kora Abuja |
  | Kora PH Ltd | RC 1377281 | 23308817-0001 | Kora Port Harcourt |

  The walkthroughs only need Kora Victoria Island under Kora Hospitality Ltd. Kora Lekki is not seeded: it is the hotel the owner adds in review ("Later: opening Kora Lekki" in `going-live.md`).
- **Properties:**
  - **Kora Victoria Island**, Plot 1412 Ahmadu Bello Way, Victoria Island, Eti-Osa, Lagos, with a placeholder Kora logo. 120 rooms: 14 on each of floors 3–10, 8 suites on floor 11. The walkthroughs happen here. Room types (code), guests, BAR rate (room only, per night, excl. taxes) and rooms:

    | Room type | Code | Bed · guests | Size | BAR | Rooms |
    |---|---|---|---|---|---|
    | Standard Queen | `STQ` | Queen · 2 adults | 24 m² | ₦120,000 | 36: 301–314, 701–714, 801–808 |
    | Deluxe King | `DLK` | King · 2 adults + 1 child | 32 m² | ₦150,000 | 48: 401–414, 809–814, 901–914, 1001–1014 |
    | Executive King | `EXK` | King · 2 adults + 1 child | 40 m² | ₦210,000 | 28: 501–514, 601–614 |
    | Junior Suite | `JRS` | King + sofa bed · 3 adults + 1 child | 58 m² | ₦320,000 | 8: 1101–1108 |

    Floors 3–6 are one type each; floors 7–10 are mixed (7 Standard Queen, 8 Standard Queen 801–808 and Deluxe King 809–814, 9 and 10 Deluxe King). Features: 401 City view, connecting to 402; 406 City view; 407 Roll-in shower; 412 Near lift; 502 Quiet side (Mr Mensah's "quiet room"); 1102 Ocean view, Bathtub. Accessible: 307, 407, 507, 901. Tunde set the rooms up himself (`going-live.md` step 3). Every room is `vacant` (check-in is brick 8). Brick 7 assigns rooms to stays arriving in the next 7 days (7 left unassigned: Mrs Funmilayo Adebayo and another Deluxe King and a Standard Queen arriving today among them), with Mr Mensah in 502, Mrs Ngozi Okafor (Deluxe King, Bed & breakfast, 25–27 Nov, repeat guest) in 404, Mr Rasheed Shittu in 402 from 26 Nov and Mr Uchenna Okeke in 401 from 27 Nov; marks 502, 301, 403, 504 and 1102 dirty and 303 and 408 clean (the rest inspected); Mr Emeka Kalu (Executive King, 25–27 Nov) was given 503 on 24 Nov and moved to 501 at 10:15 on 25 Nov so Tunde could put 503 out of order 25–27 Nov (AC compressor) at 10:25; 406 was out of order 22–24 Nov and 305 is booked out of order for plumbing on 1–3 Dec (Grace). At Kora Ikeja GRA the stays arriving in the next four days have rooms, one Executive King is out of order for a bathroom refit (Adaeze) and two rooms are dirty. Outlets: **Calabash restaurant** (06:30–23:00; main hall, terrace, private room), **Pool bar** (10:00–00:00), **Room service** (24 hours). Kitchen printers KITCHEN-1 and GRILL-1, bar printer BAR-2.
  - **Kora Ikeja GRA**, Ikeja GRA, Ikeja, Lagos, with no street yet (so completing a hotel's address can be tried on it). 86 rooms.
  - **Kora Abuja**, Plot 12 Aminu Kano Crescent, Wuse 2, Abuja Municipal, FCT. 104 rooms.
  - **Kora Port Harcourt**, 15 Tombia Street, GRA Phase 2, Obio-Akpor, Rivers. 72 rooms.
  - Every hotel: check-in from 14:00, check-out by 12:00, time zone Africa/Lagos.
  - The other three hotels use the same four room types and codes in simple blocks of 14 rooms per floor from floor 1, with the Junior Suites on the top floor: Ikeja GRA 28 / 28 / 28 / 2, Abuja 28 / 42 / 28 / 6, Port Harcourt 28 / 28 / 14 / 2 (Standard Queen / Deluxe King / Executive King / Junior Suite).
- **Rate plans:** Best available (`BAR`, room only), Bed & breakfast (`BB`, BAR + ₦18,000), Non-refundable (`NRF`, BAR − 10%), Acme Energy (`ACME`) and Acme Energy B&B (`ACME-BB`), corporate only. Prices excl. taxes and service charge, the same on Fri and Sat. Dates on Best available at Kora Victoria Island: **Festive season** 18 Dec 2026 – 2 Jan 2027 (₦140,000 / ₦175,000 / ₦240,000 / ₦360,000, min stay 2); Sat 5 Dec Deluxe King ₦165,000 and min stay 2 on all types; Wed 2 Dec Executive King closed to arrival. The other hotels have Best available, Bed & breakfast and Non-refundable: Ikeja GRA ₦95,000 / ₦120,000 / ₦165,000 / ₦250,000, Abuja ₦110,000 / ₦140,000 / ₦195,000 / ₦300,000, Port Harcourt ₦100,000 / ₦130,000 / ₦180,000 / ₦280,000.
- **Corporate rate:** Acme Energy, Executive King ₦180,000 per night at Kora Victoria Island (as in the tape chart design); Deluxe King ₦130,000 with breakfast.
- **Taxes and charges:** VAT, Lagos consumption tax and a 10% service charge, all from configuration, set up with one click and verified by Kunle Ade at Kora Victoria Island; a service charge change to 12.5% is scheduled for 1 Jan 2027. FCT and Rivers consumption taxes are added by hand. Amounts marked * in the walkthroughs use **illustrative** rates (VAT 7.5%, Lagos consumption tax 5%), the same as the designs — verify against current law before they go into the seed.
- **Reservations:** about 430 at Kora Victoria Island over the next 30 nights, booked through the booking service by Chiamaka Eze, Sade Bakare and Tunde Bello on earlier business dates (26 arriving on the business date, Mr Mensah's VI-2611-0482 among them; the next ten nights 60–80% full; Junior Suite 1 left 15 days out and sold out the night after, the Adeyemi–Nwosu wedding; Deluxe King 3 left 16 days out; one 10% Repeat guest discount by Chiamaka; one min-stay book-through by Sade) and about 20 at Kora Ikeja GRA; none at Kora Abuja or Kora Port Harcourt. Booking prefixes VI, IKJ, ABJ, PH. Dates follow the seed's business date (the walkthroughs assume 25 Nov 2026). Ms Sarah Collins is not seeded: she is the booking made in review.
- **Other illustrative values:** Deluxe King Bed & breakfast ₦168,000 (₦18,000 of it the meal allocation); deposit of the first night; free cancellation until 48 hours before arrival; FX ₦1,620 = $1 (CBN, 25 Nov 2026) and ₦1,950 = £1 (rate source shown); bank accounts Zenith Bank ••••4471 (NGN, guest transfers for both Lagos hotels) and ••••9012 (USD) for Kora Hospitality Ltd; POS terminals Moniepoint · Desk 1, Moniepoint · Calabash and OPay · Pool bar at Kora Victoria Island; shared devices sign out after 90 seconds idle on restaurant tablets and 5 minutes on front desk PCs and housekeeping phones (as built, decision 0022).
- **Corporate account:** Acme Energy Ltd (credit limit ₦15,000,000, 30-day terms).
- **People:**
  - Mrs Adaeze Okafor (owner)
  - Tunde Bello (GM, Kora Victoria Island)
  - Chiamaka Eze (front desk, morning)
  - Ibrahim Musa (front desk, night shift)
  - Blessing Udo (room attendant)
  - Grace Akpan (housekeeping supervisor)
  - Emeka Nwosu (waiter)
  - Halima Yusuf (restaurant cashier)
  - Femi Adeyemi (F&B manager)
  - Kunle Ade (finance, group)
  - Sade Bakare (revenue manager, Kora Victoria Island and Kora Ikeja GRA)
- **Signing in to the demo:** after `pnpm db:seed`, each person signs in as `firstname@kora.example` (e.g. `adaeze@kora.example`) with `DEMO_PASSWORD` from `.env.example`; the seed prints everyone's role and staff PIN. It also adds shared devices FD-VI-01, POS-VI-03 and HK-VI-07 at Kora Victoria Island and FD-IKJ-01 at Kora Ikeja GRA (none at Kora Abuja or Kora Port Harcourt), a pending invite for a Kora Abuja GM (`ngozi@kora.example`), and front desk's rate-override limit raised to 12% with a reason. Approvals (brick 5): Chiamaka's 15% at Kora Victoria Island approved by Tunde's PIN on FD-VI-01 and used, Ibrahim's 18% declined by Tunde ("Max 12% this week"), Chiamaka's 14% expired, and Sade's 30% at Kora Ikeja GRA approved by Adaeze in the inbox; all closed, so nothing is waiting after seeding. Changes (brick 6): at Kora Victoria Island a booking extended by a night, Kola Bankole's booking moved a day by Sade, a free cancellation, a late non-refundable cancellation to charge, a late cancellation Tunde waived, one Ibrahim asked Tunde to waive in his inbox (approved), a no-show from yesterday to charge, and three to try today (Kelechi Obi arriving tomorrow after free cancellation ended, and two arrivals today: Grace Eboh and Abubakar Sule, whose Abuja flight was cancelled); at Kora Ikeja GRA a late cancellation Sade waived. The seed prints today's three reservation numbers.
- **Guests:** Mr Daniel Mensah (Ghanaian, business traveller from Acme Energy), Ms Sarah Collins (British, books direct), the Okoro family (walk-in).

## How each walkthrough is written
1. **Who, goal, device, stage**, and the screens involved (numbers from `docs/design/claude-design-prompt.md`).
2. **The walkthrough:** numbered steps. Each says what the person does, what they see, and what Vento does behind the scenes (locks, audit events, tax lines, business date, sync).
3. **What can go wrong:** the edge cases, and what the person sees when they happen.
4. **Targets:** time and clicks this journey must meet.
5. **Becomes tests:** the e2e journey and the key assertions.
6. **Open questions:** anything the walkthrough exposed that isn't decided yet.

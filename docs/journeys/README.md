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
- **Entity:** Kora Hospitality Ltd (owns all four properties).
- **Properties:**
  - **Kora Victoria Island**, Victoria Island, Eti-Osa, Lagos. 120 rooms. The walkthroughs happen here. Room types and BAR rates (room only, per night, excl. taxes): Standard Queen ₦120,000 (3rd floor, e.g. 301–305), Deluxe King ₦150,000 (4th floor, e.g. 401–406), Executive King ₦210,000 (5th and 6th floors, e.g. 501–504, 611), Junior Suite ₦320,000 (11th floor, e.g. 1101–1102). Outlets: **Calabash restaurant** (06:30–23:00; main hall, terrace, private room), **Pool bar** (10:00–00:00), **Room service** (24 hours). Kitchen printers KITCHEN-1 and GRILL-1, bar printer BAR-2.
  - **Kora Ikeja GRA**, Ikeja GRA, Ikeja, Lagos. 86 rooms.
  - **Kora Abuja**, Wuse 2, Abuja Municipal, FCT. 104 rooms.
  - **Kora Port Harcourt**, GRA Phase 2, Obio-Akpor, Rivers. 72 rooms.
- **Rate plans:** BAR (rates above, room only), BAR Bed & Breakfast, Non-refundable (BAR − 10%), Corporate (negotiated per company).
- **Corporate rate:** Acme Energy, Executive King ₦180,000 per night at Kora Victoria Island (as in the tape chart design); Deluxe King ₦130,000 with breakfast.
- **Taxes and charges:** VAT, Lagos consumption tax and a 10% service charge, all from configuration. Amounts marked * in the walkthroughs use **illustrative** rates (VAT 7.5%, Lagos consumption tax 5%), the same as the designs — verify against current law before they go into the seed.
- **Other illustrative values:** Deluxe King Bed & Breakfast ₦165,000; deposit of the first night; free cancellation until 48 hours before arrival; FX ₦1,950 = £1 (rate source shown); shared devices sign out after 90 seconds idle on restaurant tablets and 5 minutes on front desk PCs and housekeeping phones (as built, decision 0022).
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
- **Signing in to the demo:** after `pnpm db:seed`, each person signs in as `firstname@kora.example` (e.g. `adaeze@kora.example`) with `DEMO_PASSWORD` from `.env.example`; the seed prints everyone's role and staff PIN. It also adds shared devices FD-VI-01, POS-VI-03 and HK-VI-07 at Kora Victoria Island, a pending invite for a Kora Abuja GM (`ngozi@kora.example`), and front desk's rate-override limit raised to 12% with a reason.
- **Guests:** Mr Daniel Mensah (Ghanaian, business traveller from Acme Energy), Ms Sarah Collins (British, books direct), the Okoro family (walk-in).

## How each walkthrough is written
1. **Who, goal, device, stage**, and the screens involved (numbers from `docs/design/claude-design-prompt.md`).
2. **The walkthrough:** numbered steps. Each says what the person does, what they see, and what Vento does behind the scenes (locks, audit events, tax lines, business date, sync).
3. **What can go wrong:** the edge cases, and what the person sees when they happen.
4. **Targets:** time and clicks this journey must meet.
5. **Becomes tests:** the e2e journey and the key assertions.
6. **Open questions:** anything the walkthrough exposed that isn't decided yet.

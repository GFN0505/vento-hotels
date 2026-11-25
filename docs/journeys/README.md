# User walkthroughs

Real people doing real work in Vento, step by step. Each walkthrough ties screens, rules and edge cases together, so we can see where a flow is clumsy before we build it.

They are used for:
- **Specs:** the product-manager writes stage specs from them.
- **Design reviews:** walk the designs through them screen by screen.
- **End-to-end tests:** each walkthrough becomes a Playwright journey in `apps/web/e2e/journeys/`.
- **Training and sales demos:** they run on the demo seed (`pnpm db:seed`).

When a feature changes how someone works, update the walkthrough in the same change.

## The walkthroughs

All walkthroughs describe the same day, 25 Nov 2026, at Lekki Bay, so the same rooms, guests and money carry across them.

| Walkthrough | Who | First works | Complete at |
|---|---|---|---|
| [Front desk morning](front-desk-morning.md) | Front desk agent | Stage 1 | Stage 2 (room checks, work orders) |
| [Night audit](night-audit.md) | Front desk agent on the night shift | Stage 1 | Stage 5 (ledger posting) |
| [Owner's morning](owner-morning.md) | Owner / MD | Stage 1 | Stage 6 (group home) |
| [Going live](going-live.md) | Hotel GM and Vento onboarding | Stage 1 | Stage 5 (ledger opening balances) |
| [Room attendant's shift](room-attendant-shift.md) | Room attendant and supervisor | Stage 2 | Stage 2 |
| [Dinner service with a power cut](waiter-dinner-service.md) | Waiter, cashier, F&B manager | Stage 3 | Stage 3 |
| [A guest's stay](guest-stay.md) | Guest (booking engine and guest app) | Stage 4 | Stage 4 |

A journey's e2e test grows with the stages: steps that need a later stage are skipped (`test.fixme`) until that stage lands.

## The demo world
All walkthroughs use the demo seed, so names and numbers match across documents and tests. Everything here is made up.

- **Organization:** Vento Demo Group.
- **Entity:** Demo Hospitality Ltd (owns both properties).
- **Properties:**
  - **Lekki Bay Hotel**, Lekki Phase 1, Eti-Osa, Lagos. 60 rooms on 4 floors: Standard (101–130), Deluxe (201–220), Executive Suite (301–310). Restaurant "Coral", bar "The Deck", room service.
  - **Garki Court Hotel**, Garki, Abuja (FCT). 40 rooms. Used where a walkthrough crosses properties.
- **Rate plans:** BAR (Standard ₦85,000, Deluxe ₦120,000, Suite ₦210,000 per night, room only), BAR Bed & Breakfast, Non-refundable (BAR − 10%), Corporate (negotiated per company).
- **Corporate rate:** Acme Energy, Deluxe ₦105,000 per night with breakfast at Lekki Bay.
- **Taxes and charges:** VAT, Lagos consumption tax and a 10% service charge, all from configuration. Amounts marked * in the walkthroughs use **illustrative** rates (VAT 7.5%, Lagos consumption tax 5%) — verify against current law before they go into the seed.
- **Other illustrative values:** Deluxe Bed & Breakfast ₦135,000; deposit of the first night; free cancellation until 48 hours before arrival; FX ₦1,950 = £1 (rate source shown); shared-device auto sign-out after 2 minutes idle.
- **Corporate account:** Acme Energy Ltd (credit limit ₦5,000,000, 30-day terms).
- **People:**
  - Mrs Adaeze Okafor (owner)
  - Tunde Bello (GM, Lekki Bay)
  - Chiamaka Eze (front desk, morning)
  - Ibrahim Musa (front desk, night shift)
  - Blessing Udo (room attendant)
  - Grace Akpan (housekeeping supervisor)
  - Emeka Nwosu (waiter)
  - Halima Yusuf (restaurant cashier)
  - Femi Adeyemi (F&B manager)
  - Kunle Ade (finance, group)
- **Guests:** Mr Daniel Mensah (Ghanaian, business traveller from Acme Energy), Ms Sarah Collins (British, books direct), the Okoro family (walk-in).

## How each walkthrough is written
1. **Who, goal, device, stage**, and the screens involved (numbers from `docs/design/claude-design-prompt.md`).
2. **The walkthrough:** numbered steps. Each says what the person does, what they see, and what Vento does behind the scenes (locks, audit events, tax lines, business date, sync).
3. **What can go wrong:** the edge cases, and what the person sees when they happen.
4. **Targets:** time and clicks this journey must meet.
5. **Becomes tests:** the e2e journey and the key assertions.
6. **Open questions:** anything the walkthrough exposed that isn't decided yet.

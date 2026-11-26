# UX standard

The bar every screen in Vento Hotels must clear before the owner sees it. It's the checklist the **ui-designer** review uses, and most of it is also checked automatically (marked **auto**). Details and patterns live in the `design-system`, `ux-writing` and `brand` skills; this page is the gate.

A screen is done when every line below is true, or the exception is written in the pull request.

## 1. Fast, everywhere
- [ ] Interactions feel instant (under 100 ms): optimistic updates for safe actions, no spinners for local work.
- [ ] A page shows something useful in under 1 second on a mid-range Android phone over a weak connection.
- [ ] JavaScript and CSS stay within the budgets in `apps/web/bundle-budget.json` (**auto**: CI fails over budget).
- [ ] Lists are server-paginated; nothing loads thousands of rows into the browser.

## 2. Clear
- [ ] Simple flows: a new member of staff can use the screen without training, in as few steps as possible. The machinery behind it (permissions, switches, audit, offline sync) stays invisible until it matters, and then speaks plainly. "Simple" is about the flow, never about plainer visuals.
- [ ] One job per screen, one primary action, and the most important number or status is the first thing seen.
- [ ] Common tasks take 3 clicks or fewer, or one ⌘K command. A new person finishes their first real task in under 5 minutes without training.
- [ ] Every screen sets its tab title (`usePageTitle`), and has one `h1`.
- [ ] Words come from `docs/DOMAIN.md`, follow `ux-writing`, and never show codes, ids or technical errors.
- [ ] Nothing on the screen that doesn't help someone decide or act.

## 3. Every state is designed
- [ ] Loading (skeleton matching the final layout, no layout shift), empty (one helpful action), filtered-empty, error (what happened and what to do, with retry), offline (cached data, "saved on this device", sync count) and success.
- [ ] Long names, long emails, large amounts and many rows don't break the layout.
- [ ] Nothing jumps: messages appearing under a field don't move the form, and nothing shifts under a finger mid-tap.

## 4. Forms behave
- [ ] Every field uses `Field` / `EmailField`: label above, never placeholder-only, example text starts "e.g.".
- [ ] Checked when moving on to the next field, never on tapping a button; messages clear the moment the field is fixed; submit moves focus to the first problem.
- [ ] Passwords: show/hide, Caps Lock warning, the live rule checklist once typing starts, "Passwords match".
- [ ] Right keyboard and autofill on phones (`inputMode`, `autoComplete`, no autocorrect on emails and codes).
- [ ] Buttons that start an action show a spinner (`loading`) and can't be pressed twice.
- [ ] Sensitive actions ask for a reason in the same dialog; over-limit actions offer approval instead of a dead end.

## 5. Works for everyone (accessibility, WCAG 2.2 AA)
- [ ] No automated accessibility violations on any page the browser tests visit (**auto**: axe scan in Playwright, light and dark).
- [ ] Contrast at least 4.5:1 for text and 3:1 for icons and borders that carry meaning, in light and dark.
- [ ] Everything works with the keyboard alone, in a sensible order, with a visible focus ring; Enter submits forms.
- [ ] Every control has a name a screen reader can say; status changes are announced; colour is never the only signal.
- [ ] Motion is calm and stops for people who ask for reduced motion.

## 6. Phones, tablets and shared devices
- [ ] Works at 375px with no sideways scrolling; checked at 375, 768 and 1440 (**auto**: browser tests run desktop and phone).
- [ ] Touch targets at least 44px (48px on POS and housekeeping); 16px text in inputs so iPhones don't zoom.
- [ ] Nothing important appears only on hover.
- [ ] Never a link to a page that doesn't exist yet.

## 7. Looks like Vento
- [ ] Classy and creative: every visible surface gets real design craft (page headers with status badges, considered empty states, depth, purposeful motion, data shown richly). A bare screen gets more craft, not fewer details. Vento Real Estate is the house bar.
- [ ] Design tokens only (no hex in components); light by default and correct in dark mode.
- [ ] Matches the approved design in `docs/design/export/`, or the difference is in `docs/design/CHANGES.md`.
- [ ] Brand surfaces follow the `brand` skill: "Vento Hotels" lockup, Fraunces only for brand headlines.

## How it's enforced
1. **Automatic, on every pull request (CI):** accessibility scans, bundle budgets, browser tests on desktop and phone.
2. **ui-designer review, before the owner:** the agent checks the brick's screens against this page in light, dark, desktop and phone, and its findings are fixed or listed in the pull request.
3. **Owner's hands-on review:** the owner tries every user-facing feature in the running app before merging.

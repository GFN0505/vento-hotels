# Design export

The approved Vento Hotels designs, exported from Claude Design on 25 Nov 2026. These are the source of truth for the UI: when docs or skills disagree with them, follow the designs and fix the docs.

## What's here
- **448 `.dc.html` files.** One per board: all 46 screens from `../claude-design-prompt.md`, with dark, 390px mobile, and loading / empty / error / offline variants. File names follow the screen (e.g. `FrontDesk*.dc.html` is screen 30, `TapeChart*.dc.html` is screen 3). A `Before` / `After` suffix marks the changes made by Update 1 of `../claude-design-update-prompt.md`.
- **`vento.css`:** the shared tokens (colours light and dark, type scale, radius, shadows) and component classes. Port the tokens into `apps/web/src/styles.css`; see the `design-system` skill.
- **`canvas.json`:** the canvas layout. It maps each file to its page and board title. Pages: Design system, Update · before and after, Screens, 20 · Owner report & leakage, 21 · Printed documents, 18 · Board pack, Shell components.

## Viewing
The files load a `support.js` runtime that only exists inside Claude Design, so they don't render in a normal browser. View them in the Claude Design project. Here, read them as reference for layout, copy, states and values: the markup and the `renderVals()` data in each file show exactly what each screen contains.

## Demo world
The designs use the made-up **Kora Hotels Group** (Kora Victoria Island, Kora Ikeja GRA, Kora Abuja, Kora Port Harcourt). The walkthroughs in `docs/journeys/` and the demo seed use the same world. Tax amounts use illustrative rates (VAT 7.5%, Lagos consumption tax 5%, service charge 10%); real rates come from configuration.

## Updating
After a new round in Claude Design, export again and replace this folder's contents in one commit, then update `../screen-inventory.md` and anything the designs changed.

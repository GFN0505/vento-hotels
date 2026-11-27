# 0027 · Approvals are single-use, bound to the exact action, and confirmed by the approver's PIN

- **Date:** 2026-11-27
- **Status:** accepted

## Context
Brick 4 refused any discount over the member's limit, which is a dead end at the desk. In most Nigerian hotels the "approval" today is the GM saying "go ahead" across the lobby or on WhatsApp, and nobody can later tell who agreed to what. Decision 0008 said over-limit actions need an approver with a higher limit; decision 0018 left the mechanism to plug into `requireWithinLimit`; decision 0023 moved approval by PIN into Stage 1. This decision is what that mechanism is, for every kind that will use it (discounts now; refunds, voids, comps, waivers and credit limit with their bricks). Spec: [stage-1-approvals.md](../specs/stage-1-approvals.md).

## Decision
- **An approval is a row, not a flag** (`approvals`): one requester, one addressed approver, one exact action, one use. Status `pending → approved | declined | cancelled | expired`; an approved one is used once (`usedAt`, the entity it was used for), inside the action's own transaction, under a row lock taken in the action's lock order (for a booking: after the inventory rows, before the reservation counter).
- **Bound to the action by a hash the server computes** from the action's own input (for a discount: the priced stay, `priceStay().hash` plus the stay's room type, plan, dates and guests). The client never sends a value, hash or subject; the server prices the action itself when the approval is asked, given and used. Any change that alters the price needs a new approval.
- **Who may approve:** a member of the same group who works at that hotel, has the same permission as the action with a limit at or above the value, and has a PIN that doesn't need a reset. Never the requester (refused on the server, and a database check). Eligibility is checked when the list is built, when the approval is given and again when it is used.
- **Always the approver's own PIN**, counted on the same wrong-try counter as the lock screen (`devices/pin-counter.ts`, decision 0022): five wrong tries lock it for 15 minutes, three lockouts need a manager's reset.
- **Two ways to answer:** *approve here* only on a registered device of that hotel (a 4-digit PIN is safe only behind the device secret); *inbox* from the approver's own session elsewhere (password on their phone, or their PIN session on a shared device), still confirmed with their PIN. The requester's session is never changed and no session is made for the approver.
- **30 minutes to answer, 30 minutes to use, never past the business date** it was asked on; fixed for every hotel. Reads compare the time themselves; a pg-boss job (`approvals.expire`, every minute) stores the expiry and writes `approval.expired`; night audit (brick 13) expires what is left before rolling the date.
- **Kinds are registered in code** (`apps/api/src/approvals/kinds/`), each declaring its permission, feature switch, value and binding. Stage 1 brick 5 registers `stay_discount`.
- **Every move is an audit event** in the same transaction (`approval.requested`, `.granted`, `.declined`, `.cancelled`, `.expired`), and the action's own event carries the approver (`approverMemberId`). The requester's booking draft is kept on a pending request for the requester only and cleared when the request closes.
- **Background polls don't count as activity**: the waiting screen's and the bell's reads (`approvals.get`, `approvals.count`) are checked as usual but don't move a PIN session's idle clock, so a waiting shared PC still locks.

## Consequences
- An over-limit discount always has two names on it, and the owner's report can say who approved it.
- An approval can't be replayed for another booking, another price or another day, nor used by someone else.
- A waiting booking holds no rooms: the room can sell while the agent waits, and she sees brick 4's sold-out message.
- Approvals need a connection; nothing is approved offline.
- New kinds (refunds, voids, waivers) reuse the prompt, the inbox and the checks; each adds its kind file and wires `useApproval` into its own transaction.

## Alternatives considered
- **A flag on the action** ("approved by" typed in): no proof, no single use, replayable.
- **The approver signs in on the requester's screen with their password:** worse on someone else's PC, and it replaces the requester's session.
- **Every eligible manager gets the request, first answer wins:** faster, but noisier inboxes and the owner asked for every desk discount (owner, 27 Nov 2026: the one manager the agent picks).
- **The approval books by itself:** the agent confirms the final price with the guest and the room may have sold meanwhile (owner: the agent books).
- **Approve here on any device with the PIN:** a 4-digit PIN without the device secret is guessable (owner: inbox only on personal devices).

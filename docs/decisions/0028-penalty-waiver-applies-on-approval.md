# 0028 · A penalty waiver approved in the inbox applies when it is approved

- **Date:** 2026-11-27
- **Status:** accepted
- **Extends:** [0027](0027-approvals.md) for the `penalty_waiver` kind only

## Context
Decision 0027 says the requester completes the action after an approval: the approval is used once, inside the action's own transaction. That fits a discount, where the booking can't be made until the price is agreed and the room may have sold meanwhile. A waiver is different. When a front desk agent or the night auditor cancels or marks a no-show and no manager is nearby, the rooms must be released at once, so the cancel or no-show is saved and the penalty recorded **to charge**. The penalty is then a fixed row: its amount, kind and stay can't change. Making the night auditor come back after the GM approves at 00:41 to "finish" the waiver adds a step that can be forgotten and leaves the penalty to be charged in error. Spec: [stage-1-modify-cancel.md](../specs/stage-1-modify-cancel.md), Open question 4 (owner, 27 Nov 2026: as recommended).

## Decision
- A `penalty_waiver` asked in the **inbox** is always for a penalty already recorded (the dialogs save the cancel, no-show or change first). When the addressed approver approves it with their PIN, the waiver is applied **in the approver's transaction**: the penalty becomes `waived`, the approval is marked used, a `reservation_changes` row of kind `waive` is written, and `reservation.penalty_waived` is recorded with the **approver as the actor**, `after.requestedBy` naming the requester, `exception: 'penalty_waived'`.
- Lock order for that transaction: the reservation row (looked up from the approval without a lock), then the approval row, then the approver's PIN row, then the penalty row. A cancel, a Penalty-card waiver and a modify take the reservation row first too, so they can't deadlock.
- The binding hash still covers the penalty (id, kind, amount) and the reason for waiving; the approver re-checks eligibility as usual. A penalty no longer to charge (waived meanwhile, or posted from brick 10) refuses the approval (`PENALTY_NOT_OPEN`).
- **Same screen** is unchanged from 0027: the approver's PIN on the desk gives an approval that the cancel, no-show or change uses in its own transaction, so the action and the waiver happen together.
- Every other kind keeps 0027's "the requester completes the action".

## Consequences
- The night auditor's no-show and the rooms it releases never wait for a manager; the Penalty card turns from "Waiver asked of Tunde Bello" to "Waived · Approved by Tunde Bello" within seconds of his answer.
- Declined or expired requests leave the penalty to charge; the desk can ask again.
- The owner's daily report has both names on every waiver: who asked, who approved.

## Alternatives considered
- **The requester completes the waiver after approval (0027 as it stands):** an extra step at night that is easy to forget, for an action that can't change after approval.
- **Hold the cancel or no-show until the approval:** the rooms stay held while the manager is asleep, which is the problem the brick solves.

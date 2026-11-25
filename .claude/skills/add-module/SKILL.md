---
name: add-module
description: Step-by-step recipe for adding a new domain module (e.g. rate plans, work orders, purchase orders) end to end — zod schema, oRPC contract, Drizzle table, service, router, permissions and limits, audit events, property scoping, tests, seed. Use when creating a new entity or resource.
---

# Add a module

Example module: `workOrder` (a maintenance task on a room or asset that can put the room out of order). Replace names throughout. Check `docs/DOMAIN.md` for the correct terms, statuses and relationships first.

## 1. Shared schema — `packages/shared/src/work-order/schema.ts`
```ts
import { z } from 'zod'
import { id, money, currency, paginationInput, isoDate, Decimal } from '../common'

export const workOrderStatus = z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed'])
export const workOrderPriority = z.enum(['low', 'normal', 'high', 'urgent'])

export const workOrder = z.object({
  id,
  propertyId: id,
  roomId: id.nullable(),
  assetId: id.nullable(),
  title: z.string().min(3, 'Describe the problem in a few words').max(120),
  priority: workOrderPriority,
  status: workOrderStatus,
  assigneeId: id.nullable(),
  reportedOn: isoDate,          // the property's business date, not the wall clock
  outOfOrderFrom: isoDate.nullable(),
  outOfOrderTo: isoDate.nullable(),   // exclusive, like a departure date
  cost: money.nullable(),       // decimal string, never number
  currency,                     // 'NGN' | 'USD' | 'GBP' | 'EUR'
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const createWorkOrderInput = workOrder
  .pick({ propertyId: true, roomId: true, assetId: true, title: true, priority: true, outOfOrderFrom: true, outOfOrderTo: true })
  .extend({ outOfOrderReason: z.string().min(3).optional() })
  .refine((v) => v.roomId || v.assetId, { path: ['roomId'], message: 'Choose a room or an asset' })
  .refine((v) => !v.outOfOrderFrom || (v.roomId && v.outOfOrderTo && v.outOfOrderTo > v.outOfOrderFrom), {
    path: ['outOfOrderTo'], message: 'The end date must be after the start date',
  })
  .refine((v) => !v.outOfOrderFrom || v.outOfOrderReason, { path: ['outOfOrderReason'], message: 'Give a reason for taking the room out of order' })

export const updateWorkOrderInput = createWorkOrderInput.partial().extend({ id, cost: money.optional(), currency: currency.optional() })
export const listWorkOrdersInput = paginationInput.extend({
  propertyId: id.optional(),
  status: workOrderStatus.optional(),
  priority: workOrderPriority.optional(),
  roomId: id.optional(),
})

export type WorkOrder = z.infer<typeof workOrder>
```
Rules: user-facing error messages in plain English. The same schema drives the form, so write messages for end users. Use `new Decimal(...)` for any money comparison, never `Number()`.

## 2. Contract — `packages/shared/src/work-order/contract.ts`
```ts
import { oc } from '@orpc/contract'
import { paginated } from '../common'

export const workOrderContract = {
  list: oc.input(listWorkOrdersInput).output(paginated(workOrder)),
  get: oc.input(z.object({ id })).output(workOrder),
  create: oc.input(createWorkOrderInput).output(workOrder),
  update: oc.input(updateWorkOrderInput).output(workOrder),
  resolve: oc.input(z.object({ id, note: z.string().min(3) })).output(workOrder),
  remove: oc.input(z.object({ id })).output(z.void()),
}
```
Register it in `packages/shared/src/contracts/index.ts`.

## 3. Table — `apps/api/src/db/schema/work-order.ts`
Use the column helpers from `apps/api/src/db/columns.ts` (`id`, `timestamps`, `archivedAt`, `amount`, `currency`, `calendarDate`) and export the table from `db/schema/index.ts`.
```ts
export const workOrders = pgTable('work_orders', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  propertyId: uuid().notNull().references(() => properties.id),
  roomId: uuid().references(() => rooms.id),
  assetId: uuid().references(() => assets.id),
  title: text().notNull(),
  priority: workOrderPriorityEnum().notNull().default('normal'),
  status: workOrderStatusEnum().notNull().default('open'),
  assigneeId: uuid().references(() => members.id),
  reportedOn: calendarDate().notNull(),
  outOfOrderFrom: calendarDate(),
  outOfOrderTo: calendarDate(),
  outOfOrderReason: text(),
  cost: amount(),
  currency: currency(),
  ...timestamps,
}, (t) => [
  index().on(t.organizationId),
  index().on(t.organizationId, t.propertyId, t.status),
  index().on(t.roomId),
  index().on(t.assetId),
  check('work_order_target', sql`${t.roomId} IS NOT NULL OR ${t.assetId} IS NOT NULL`),
  check('work_order_ooo_range', sql`${t.outOfOrderFrom} IS NULL OR ${t.outOfOrderTo} > ${t.outOfOrderFrom}`),
  check('work_order_cost_non_negative', sql`${t.cost} IS NULL OR ${t.cost} >= 0`),
])
```
Then follow the `db-migration` skill.

## 4. Service — `apps/api/src/modules/work-order/work-order.service.ts`
- Functions take `(db, access, input)`, where `access` comes from the `inOrganization` middleware (`apps/api/src/tenancy/access.ts`: `organizationId`, `memberId`, `role`, `allProperties`, `propertyIds`). Every `where` includes `eq(workOrders.organizationId, access.organizationId)` **and** `scopeToProperties(access, workOrders.propertyId)`, combined with `and(...)`. Never write the property filter by hand, and never take `organizationId` from input. Reads outside scope throw `NOT_FOUND`. See `tenancy/service.ts` for the pattern and `tenancy/tenancy.test.ts` for the isolation and scoping tests to copy.
- Check that referenced rows (property, room, asset, assignee) belong to the same organization *and* the same property before you insert. A room from another hotel in the group is `NOT_FOUND`, not a silent link.
- Dates come from the property: `reportedOn` defaults to the property's current **business date** (`getBusinessDate(tx, propertyId)`), never `new Date()`.
- Enforce domain rules here (e.g. `open → assigned → in_progress → resolved → closed` only; a room can't be put out of order for dates with in-house or arriving stays → `CONFLICT` "Room 204 has a guest arriving on 26 Nov 2026. Move the stay first.").
- Anything that changes availability goes inside `ctx.db.transaction(async (tx) => …)` and takes the inventory lock first: `lockInventory(tx, { roomTypeId, from, to })` (`SELECT … FOR UPDATE` on the room-type inventory rows per date). Putting a room OOO marks the room's housekeeping status `out_of_order`, reduces availability for each date, and queues an ARI push to channels in the same transaction. Resolving the work order returns the room to inventory the same way (status `dirty`, so housekeeping inspects it before it's sold).
- **Audit every write.** Each create, update, status change and resolve calls `recordAudit(tx, { action: 'work_order.resolve', entity: 'work_order', entityId, before, after, reason })` inside the same transaction; actor, device, property and business date come from `ctx`. Putting a room OOO is also a room status change, so it audits on the room too. Never update or delete audit rows.
- Use the decimal helpers from `@vento/shared` (`dec`, `toAmount`) for any maths on `cost`; validate input with `amountSchema` / `moneySchema`, ids with `idSchema`, lists with `pageQuerySchema` / `pageSchema`.
- Lists: build filters with `and(...)`, return `{ items, page, pageSize, total }` using the shared `paginate` helper.

## 5. Router — `apps/api/src/modules/work-order/work-order.router.ts`
```ts
export const workOrderRouter = {
  list: authed.use(requirePermission('maintenance', 'read')).workOrder.list.handler(({ input, context }) => list(context, input)),
  create: authed.use(requirePermission('maintenance', 'create')).workOrder.create.handler(({ input, context }) => create(context, input)),
  resolve: authed.use(requirePermission('maintenance', 'update')).workOrder.resolve.handler(({ input, context }) => resolve(context, input)),
  // …
}
```
No try/catch. Throw `ORPCError` in the service, and the central handler formats it. Register in `apps/api/src/router.ts` and add the module's actions to the permission map. `requirePermission` also checks the input's `propertyId` against the member's allowed properties; the service still scopes every query because `get`/`update` take only an `id`.

**Permission limits.** If an action has a limit in the permissions matrix in `docs/DOMAIN.md` (a discount %, a refund amount, a cost above which a work order needs GM approval), add its row to the matrix seed defaults and check it in the service with `assertWithinLimit(ctx, 'maintenance.approve_cost', input.cost, input.approval)`. The helper reads the organization's configured limit, and over the limit it verifies the approver's credentials (password or PIN on the same device), rejects an approver who is the actor or whose own limit is too low, and returns the approver id for the audit event. Never compare against a constant or a limit sent by the client. If the action is on the exception list (void, comp, discount, override, refund…), make sure its audit event carries what the owner's daily report needs (amount, staff, reason, approver).

## 6. Tests — `work-order.service.test.ts`
Cover the happy path, validation, permission denied, not found, the domain conflict (OOO over an arriving stay), the availability change (OOO reduces sellable rooms for exactly those dates, resolve restores them), **cross-organization access returns NOT_FOUND**, **a member limited to property A gets NOT_FOUND for a work order at property B**, **an audit event for each write** (with before/after and reason), and for limited actions **at, over and self-approved limit cases**. See `testing-patterns`.

## 7. Seed
Add realistic records to `pnpm db:seed` (the demo group: two properties, a week of history) so the module is usable in local dev and sales demos, e.g. a few open and resolved work orders and one room out of order. If hotels bring this data from another system at go-live, add an import kind per the `data-import` skill.

## 8. Web
Follow the `add-list-page` skill.

## Done when
`pnpm check && pnpm typecheck && pnpm test` pass, the migration is generated and applied, every write has an audit event, and `pnpm db:seed` loads cleanly.

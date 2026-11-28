// The plan editor's form: values as typed, checked with the shared schema on save so messages match
// the API's, and turned into the create or update input (spec: rate plans, "Fields").
import {
  type BookableBy,
  type CancellationPolicy,
  type CreateRatePlanInput,
  createRatePlanSchema,
  DEFAULT_CANCELLATION,
  DEFAULT_DEPOSIT,
  type DepositRule,
  type MealPlan,
  type RatePlanView,
} from '@vento/shared'
import { nairaField } from './money-input'

export type PriceRow = { on: boolean; weekday: string; weekend: string }

export type PlanForm = {
  name: string
  code: string
  codeEdited: boolean
  pricing: 'own' | 'derived'
  parentId: string
  // A derived plan's adjustment: one of the two, the other blank.
  offset: string
  percent: string
  rows: Record<string, PriceRow>
  mealPlan: MealPlan
  mealAllocation: string
  cancelKind: CancellationPolicy['kind']
  cancelHours: string
  penalty: 'first_night' | 'full_stay' | 'percent_of_stay'
  penaltyPercent: string
  depositKind: DepositRule['kind']
  depositPercent: string
  dueKind: 'at_booking' | 'within_hours'
  dueHours: string
  minStay: string
  extraAdult: string
  bookableBy: BookableBy
  pricesIncludeTaxes: boolean
}

export type Problems = Record<string, string | undefined>

// Screen order, for moving focus to the first problem. Price inputs are `weekday-<id>`.
export function fieldOrder(typeIds: readonly string[]): string[] {
  return [
    'name',
    'code',
    'parentId',
    'offset',
    'percent',
    ...typeIds.flatMap((id) => [`weekday-${id}`, `weekend-${id}`]),
    'roomTypes',
    'mealAllocation',
    'cancelHours',
    'penaltyPercent',
    'depositPercent',
    'dueHours',
    'minStay',
    'extraAdult',
  ]
}

const naira = nairaField
const percent = (value: string) => value.replace(/\.?0+$/, '')

export function formFrom(
  plan: RatePlanView | undefined,
  roomTypeIds: readonly string[],
  options: { copy?: boolean } = {},
): PlanForm {
  const rows: Record<string, PriceRow> = {}
  for (const id of roomTypeIds) {
    const row = plan?.roomTypes.find((r) => r.roomTypeId === id)
    rows[id] = {
      on: plan ? Boolean(row) : true,
      weekday: naira(row?.weekday),
      weekend: naira(row?.weekend),
    }
  }
  const cancel = plan?.cancellation ?? DEFAULT_CANCELLATION
  const deposit = plan?.deposit ?? DEFAULT_DEPOSIT
  const adj = plan?.adjustment
  return {
    name: plan ? (options.copy ? `${plan.name} copy` : plan.name) : '',
    code: plan && !options.copy ? plan.code : '',
    codeEdited: Boolean(plan && !options.copy),
    pricing: plan?.pricing ?? 'own',
    parentId: plan?.parent?.id ?? '',
    offset: adj?.kind === 'amount' ? naira(adj.value) : '',
    percent: adj?.kind === 'percent' ? percent(adj.value) : '',
    rows,
    mealPlan: plan?.mealPlan ?? 'room_only',
    mealAllocation: naira(plan?.mealAllocation),
    cancelKind: cancel.kind,
    cancelHours: cancel.kind === 'free_until' ? String(cancel.hours) : '48',
    penalty: cancel.kind === 'free_until' ? cancel.penalty.kind : 'first_night',
    penaltyPercent:
      cancel.kind === 'free_until' && cancel.penalty.kind === 'percent_of_stay'
        ? percent(cancel.penalty.percent)
        : '',
    depositKind: deposit.kind,
    depositPercent: deposit.kind === 'percent_of_stay' ? percent(deposit.percent) : '',
    dueKind: deposit.kind === 'none' ? 'within_hours' : deposit.due.kind,
    dueHours:
      deposit.kind !== 'none' && deposit.due.kind === 'within_hours'
        ? String(deposit.due.hours)
        : '48',
    minStay: String(plan?.minStay ?? 1),
    extraAdult: naira(plan?.extraAdult),
    bookableBy: plan?.bookableBy ?? 'anyone',
    pricesIncludeTaxes: plan?.pricesIncludeTaxes ?? true,
  }
}

const int = (text: string) => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

function cancellation(form: PlanForm): unknown {
  if (form.cancelKind === 'non_refundable') return { kind: 'non_refundable' }
  const penalty =
    form.penalty === 'percent_of_stay'
      ? { kind: 'percent_of_stay', percent: form.penaltyPercent.trim() }
      : { kind: form.penalty }
  return { kind: 'free_until', hours: int(form.cancelHours), penalty }
}

function deposit(form: PlanForm): unknown {
  if (form.depositKind === 'none') return { kind: 'none' }
  const due =
    form.dueKind === 'at_booking'
      ? { kind: 'at_booking' }
      : { kind: 'within_hours', hours: int(form.dueHours) }
  return form.depositKind === 'percent_of_stay'
    ? { kind: 'percent_of_stay', percent: form.depositPercent.trim(), due }
    : { kind: form.depositKind, due }
}

export function adjustmentOf(form: PlanForm): unknown {
  if (form.offset.trim()) return { kind: 'amount', value: form.offset.trim().replace(/[−–]/g, '-') }
  if (form.percent.trim()) {
    return { kind: 'percent', value: form.percent.trim().replace(/%$/, '').replace(/[−–]/g, '-') }
  }
  return null
}

// What the schema checks (before its transforms), for create; update adds id, version and reason.
export function toInput(form: PlanForm, propertyId: string, roomTypeIds: readonly string[]) {
  const own = form.pricing === 'own'
  const chosen = roomTypeIds.filter((id) => form.rows[id]?.on)
  return {
    propertyId,
    name: form.name,
    code: form.code,
    pricing: form.pricing,
    parentId: own ? null : form.parentId || null,
    adjustment: own ? null : adjustmentOf(form),
    roomTypes: chosen.map((id) => {
      const row = form.rows[id]
      return own
        ? {
            roomTypeId: id,
            weekday: row?.weekday.trim() || undefined,
            weekend: row?.weekend.trim() || null,
          }
        : { roomTypeId: id }
    }),
    mealPlan: form.mealPlan,
    mealAllocation: form.mealPlan === 'room_only' ? null : form.mealAllocation.trim() || null,
    cancellation: cancellation(form),
    deposit: deposit(form),
    minStay: int(form.minStay),
    extraAdult: own ? form.extraAdult.trim() || null : null,
    bookableBy: form.bookableBy,
    pricesIncludeTaxes: form.pricesIncludeTaxes,
  }
}

// Schema issue paths → the editor's field names.
function fieldFor(path: readonly PropertyKey[], chosen: readonly string[]): string {
  const [head, index, leaf] = path.map(String)
  if (head === 'roomTypes' && index !== undefined && leaf) {
    return `${leaf === 'weekend' ? 'weekend' : 'weekday'}-${chosen[Number(index)]}`
  }
  if (head === 'adjustment') return 'offset'
  if (head === 'cancellation') return path.includes('percent') ? 'penaltyPercent' : 'cancelHours'
  if (head === 'deposit') return path.includes('percent') ? 'depositPercent' : 'dueHours'
  return head ?? 'form'
}

export function check(
  form: PlanForm,
  propertyId: string,
  roomTypeIds: readonly string[],
): { problems: Problems; ok: boolean; data: CreateRatePlanInput | undefined } {
  const input = toInput(form, propertyId, roomTypeIds)
  const chosen = input.roomTypes.map((r) => r.roomTypeId)
  const problems: Problems = {}
  if (form.offset.trim() && form.percent.trim()) {
    problems.percent = 'Enter an offset or a percentage, not both'
  }
  // Blank or non-numeric whole numbers get a plain message rather than the schema's type error.
  if (Number.isNaN(input.minStay)) problems.minStay = 'Enter 1 to 30 nights'
  if (form.cancelKind === 'free_until' && Number.isNaN(int(form.cancelHours))) {
    problems.cancelHours = 'Enter whole hours, from 0 to 720'
  }
  if (
    form.depositKind !== 'none' &&
    form.dueKind === 'within_hours' &&
    Number.isNaN(int(form.dueHours))
  ) {
    problems.dueHours = 'Enter whole hours, from 1 to 720'
  }
  const result = createRatePlanSchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues)
      problems[fieldFor(issue.path, chosen)] ??= issue.message
  }
  const ok = Object.values(problems).every((p) => !p)
  return { problems, ok, data: ok && result.success ? result.data : undefined }
}

export function isDirty(a: PlanForm, b: PlanForm): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

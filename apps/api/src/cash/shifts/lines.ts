// The lines a shift is counted on, in the spec's order (no amounts): naira cash by note, each
// foreign currency the hotel's cash takes, each POS terminal fixed at opening (while POS is on),
// and bank transfers (while on). City ledger isn't money in the drawer; online card (Stage 4) will
// be counted automatically.
import { type CountLine, FOREIGN_CASH_LABELS, terminalLabel } from '@vento/shared'
import { inArray } from 'drizzle-orm'
import { posTerminals } from '../../db/schema/finance.ts'
import { methodSettings } from '../../finance/payment-methods.ts'
import type { Reader } from '../context.ts'

export const CASH_NGN_LABEL = 'Cash ₦ in the drawer, including float'

export async function terminalLabels(db: Reader, ids: readonly string[]) {
  const map = new Map<string, { label: string; archived: boolean }>()
  if (ids.length === 0) return map
  const rows = await db
    .select({
      id: posTerminals.id,
      provider: posTerminals.provider,
      name: posTerminals.name,
      archivedAt: posTerminals.archivedAt,
    })
    .from(posTerminals)
    .where(inArray(posTerminals.id, [...ids]))
  for (const row of rows) {
    map.set(row.id, { label: terminalLabel(row), archived: row.archivedAt !== null })
  }
  return map
}

export async function linesFor(
  db: Reader,
  shift: { propertyId: string; terminalIds: string[] },
): Promise<CountLine[]> {
  const settings = await methodSettings(db, shift.propertyId)
  const lines: CountLine[] = [
    {
      kind: 'cash',
      currency: 'NGN',
      posTerminalId: null,
      label: CASH_NGN_LABEL,
      hint: 'count by note',
      required: false,
    },
  ]
  if (settings.cash.enabled) {
    for (const currency of settings.cash.foreignCurrencies) {
      lines.push({
        kind: 'cash',
        currency,
        posTerminalId: null,
        ...FOREIGN_CASH_LABELS[currency],
        required: false,
      })
    }
  }
  if (settings.pos_terminal.enabled) {
    const labels = await terminalLabels(db, shift.terminalIds)
    for (const id of shift.terminalIds) {
      lines.push({
        kind: 'pos_terminal',
        currency: 'NGN',
        posTerminalId: id,
        label: `POS terminal · ${labels.get(id)?.label ?? 'Terminal'}`,
        hint: 'Total of your merchant slips this shift',
        required: true,
      })
    }
  }
  if (settings.bank_transfer.enabled) {
    lines.push({
      kind: 'bank_transfer',
      currency: 'NGN',
      posTerminalId: null,
      label: 'Bank transfers',
      hint: 'Total of transfers you confirmed this shift',
      required: true,
    })
  }
  return lines
}

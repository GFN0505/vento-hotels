// The guest message Copy confirmation puts on the clipboard (spec: UI copy, "Confirmation"), built
// on the device from the reservation detail. Vento sends nothing itself until Stage 4.
import type { ReservationDetail } from '@vento/shared'
import { cancellationShort, dateLabel, instantDate, instantLabel, naira, stayLine } from './format'

// "2pm", "1:30pm", "12pm".
export function clockWords(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

export function confirmationText(detail: ReservationDetail): {
  text: string
  noTransferAccount: boolean
} {
  const stay = detail.stays[0]
  const hotel = detail.property
  const lines: string[] = []
  lines.push(`${hotel.name}: Hello ${detail.guest.firstName}, your booking is confirmed.`)
  if (stay) {
    lines.push(
      `${stay.roomTypeName}, ${stay.terms.planName}, ${stayLine(stay.arrival, stay.departure)}, ${naira(detail.quotedTotal)} incl. taxes.`,
    )
  }
  lines.push(`Confirmation ${detail.number}.`)
  const account = detail.transferAccount
  const payTo = account
    ? ` to ${account.bankName} ${account.accountNumber} (${account.accountName}) with reference ${detail.number}.`
    : '. The hotel will send payment details.'
  const deposit = detail.depositDue
  const paidInFull =
    stay?.terms.deposit.kind === 'full_stay' && stay.terms.deposit.due.kind === 'at_booking'
  if (deposit && paidInFull) {
    lines.push(`Paid in full at booking: please pay ${naira(deposit.amount)}${payTo}`)
  } else if (deposit) {
    const by = dateLabel(instantDate(deposit.dueAt, hotel.timeZone))
    lines.push(
      `To guarantee your room, please pay a deposit of ${naira(deposit.amount)} by ${by}${payTo}`,
    )
  }
  if (stay?.cancellation.kind === 'free_until') {
    lines.push(
      `Free cancellation until ${instantLabel(stay.cancellation.deadline, hotel.timeZone)}.`,
    )
  } else if (stay) {
    const words = cancellationShort(
      stay.terms.cancellation,
      stay.terms.deposit,
      null,
      hotel.timeZone,
    )
    lines.push(`${words === 'Paid in full at booking' ? 'This booking is non-refundable' : words}.`)
  }
  lines.push(
    `Check-in from ${clockWords(hotel.checkInTime)}${hotel.address ? ` at ${hotel.address}` : ''}.`,
  )
  return { text: lines.join(' '), noTransferAccount: Boolean(deposit) && !account }
}

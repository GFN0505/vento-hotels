// Print list (⌘P; spec "Print list"): the current tab as an A4 print layout, in a frame of its own
// so the app's chrome never prints: hotel, business date, printed at and by; names, rooms and stays,
// never contact or ID details. The catalogue report (brick 15) replaces it with a PDF.
import { type FrontDeskList, type FrontDeskTab, formatRateDate } from '@vento/shared'
import { stayWords } from './rows'

const esc = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )

const TITLES: Record<FrontDeskTab, string> = {
  arrivals: 'Arrivals',
  departures: 'Departures',
  in_house: 'In house',
}

export function printList(list: FrontDeskList, tab: FrontDeskTab, byName: string) {
  const printedAt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: list.hotel.timeZone,
  }).format(new Date())
  const rows = list.items
    .map(
      (row) =>
        `<tr><td>${esc(row.room?.number ?? '–')}</td><td>${esc(row.guestName)}${row.foreign ? ' <small>(Foreign)</small>' : ''}</td><td>${esc(row.number)}</td><td>${esc(stayWords(row))}</td><td>${esc(row.status === 'checked_in' ? 'In house' : 'To come')}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${TITLES[tab]} · ${esc(list.hotel.name)}</title>
<style>@page{size:A4;margin:14mm}body{font:11pt/1.35 Inter,system-ui,sans-serif;color:#111}h1{font-size:15pt;margin:0}p{margin:2px 0 10px;color:#444}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #bbb;vertical-align:top}th{font-size:9pt;text-transform:uppercase;letter-spacing:.04em;color:#333}footer{margin-top:10px;font-size:9pt;color:#555}</style></head>
<body><h1>${TITLES[tab]} · ${esc(list.hotel.name)}</h1><p>Business date ${esc(formatRateDate(list.hotel.businessDate))} · ${list.total} ${list.total === 1 ? 'guest' : 'guests'}</p>
<table><thead><tr><th>Room</th><th>Guest</th><th>Booking</th><th>Stay</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Printed ${esc(printedAt)} by ${esc(byName)}</footer></body></html>`
  const frame = document.createElement('iframe')
  frame.title = 'Print list'
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.append(frame)
  const doc = frame.contentDocument
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  setTimeout(() => frame.remove(), 60_000)
}

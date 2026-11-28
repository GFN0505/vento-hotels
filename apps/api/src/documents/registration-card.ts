// The A4 registration card (#21) with @react-pdf/renderer (printing skill): black-and-white,
// tabular figures, Inter (with the ₦ glyph from its latin-ext file). Built from a
// RegistrationCardData only, never a query, so it is tested from fixtures. Written with
// createElement: the API runs TypeScript without a JSX step.
import { createRequire } from 'node:module'
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { RegistrationCardData } from '@vento/shared'
import { createElement as h, type ReactElement } from 'react'

const require = createRequire(import.meta.url)
const files = require.resolve('@fontsource/inter/package.json').replace('package.json', 'files/')

let registered = false
function registerFonts() {
  if (registered) return
  registered = true
  for (const [family, subset] of [
    ['Inter', 'latin'],
    ['InterExt', 'latin-ext'],
  ] as const) {
    Font.register({
      family,
      fonts: [
        { src: `${files}inter-${subset}-400-normal.woff`, fontWeight: 400 },
        { src: `${files}inter-${subset}-600-normal.woff`, fontWeight: 600 },
      ],
    })
  }
  // Names and addresses wrap at spaces, never mid-word.
  Font.registerHyphenationCallback((word) => [word])
}

// Inter first; ₦ and other currency signs come from the latin-ext file.
const FONT = ['Inter', 'InterExt']

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: FONT, fontSize: 9, color: '#111111', lineHeight: 1.35 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111111',
    paddingBottom: 10,
    marginBottom: 12,
  },
  hotel: { fontSize: 14, fontWeight: 600 },
  faint: { color: '#555555' },
  title: { fontSize: 12, fontWeight: 600, textAlign: 'right' },
  right: { textAlign: 'right' },
  reprint: {
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#111111',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  section: { marginBottom: 10 },
  label: {
    fontSize: 8,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#333333',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999999',
    paddingBottom: 2,
    marginBottom: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingRight: 8, marginBottom: 4 },
  wide: { width: '100%', paddingRight: 8, marginBottom: 4 },
  key: { fontSize: 7.5, color: '#555555' },
  value: { fontSize: 9.5, fontVariant: ['tabular-nums'] },
  term: { marginBottom: 3 },
  signatures: { flexDirection: 'row', gap: 24, marginTop: 18 },
  sign: { flex: 1 },
  signBox: { height: 42, borderBottomWidth: 1, borderBottomColor: '#111111', marginBottom: 3 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#555555',
  },
})

const WIDE = new Set(['Home address', 'Rate', 'Full name'])

function lines(items: RegistrationCardData['guest']): ReactElement {
  return h(
    View,
    { style: styles.grid },
    ...items.map((item) =>
      h(
        View,
        { key: item.label, style: WIDE.has(item.label) ? styles.wide : styles.cell, wrap: false },
        h(Text, { style: styles.key }, item.label),
        h(Text, { style: styles.value }, item.value),
      ),
    ),
  )
}

function section(title: string, body: ReactElement): ReactElement {
  return h(View, { style: styles.section }, h(Text, { style: styles.label }, title), body)
}

export function registrationCard(data: RegistrationCardData): ReactElement {
  registerFonts()
  const foreign = data.foreign
  return h(
    Document,
    { title: `Registration card ${data.cardNumber}`, author: data.hotel.name },
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(
        View,
        { style: styles.header },
        h(
          View,
          { style: { maxWidth: '60%' } },
          h(Text, { style: styles.hotel }, data.hotel.name),
          h(Text, { style: styles.faint }, data.hotel.company),
          data.hotel.address ? h(Text, { style: styles.faint }, data.hotel.address) : null,
        ),
        h(
          View,
          null,
          data.copy > 1 ? h(Text, { style: styles.reprint }, `REPRINT · copy ${data.copy}`) : null,
          h(Text, { style: styles.title }, 'Guest registration card'),
          h(Text, { style: styles.right }, `No. ${data.cardNumber}`),
          h(Text, { style: [styles.right, styles.faint] }, `Booking ${data.bookingNumber}`),
        ),
      ),
      section('1 · Guest', lines(data.guest)),
      data.companions.length
        ? section(
            'Other guests in the room',
            h(
              View,
              null,
              ...data.companions.map((name) => h(Text, { key: name, style: styles.value }, name)),
            ),
          )
        : null,
      section('2 · Stay', lines(data.stay)),
      foreign ? section('3 · Foreign national', lines(foreign)) : null,
      section(
        foreign ? '4 · Terms' : '3 · Terms',
        h(
          View,
          null,
          ...data.terms.map((term) => h(Text, { key: term, style: styles.term }, term)),
        ),
      ),
      h(
        View,
        { style: styles.signatures, wrap: false },
        h(
          View,
          { style: styles.sign },
          h(View, { style: styles.signBox }),
          h(Text, { style: styles.key }, 'Guest signature · date'),
        ),
        h(
          View,
          { style: styles.sign },
          h(
            View,
            { style: [styles.signBox, { justifyContent: 'flex-end' }] },
            h(Text, null, data.checkedInBy),
          ),
          h(Text, { style: styles.key }, `Checked in by · ${data.businessDate}`),
        ),
      ),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, null, data.printedLine),
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} of ${totalPages}`,
        }),
      ),
    ),
  )
}

// Every text the card prints, in order: what the snapshot tests compare (bytes change with dates).
export function registrationCardText(data: RegistrationCardData): string[] {
  const pairs = (items: RegistrationCardData['guest']) =>
    items.map((item) => `${item.label}: ${item.value}`)
  return [
    data.hotel.name,
    data.hotel.company,
    ...(data.hotel.address ? [data.hotel.address] : []),
    ...(data.copy > 1 ? [`REPRINT · copy ${data.copy}`] : []),
    'Guest registration card',
    `No. ${data.cardNumber}`,
    `Booking ${data.bookingNumber}`,
    '1 · Guest',
    ...pairs(data.guest),
    ...data.companions,
    '2 · Stay',
    ...pairs(data.stay),
    ...(data.foreign ? ['3 · Foreign national', ...pairs(data.foreign)] : []),
    ...data.terms,
    'Guest signature · date',
    data.checkedInBy,
    data.printedLine,
  ]
}

export async function renderRegistrationCard(data: RegistrationCardData): Promise<Buffer> {
  return renderToBuffer(registrationCard(data) as Parameters<typeof renderToBuffer>[0])
}

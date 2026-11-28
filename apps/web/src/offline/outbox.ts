// The outbox (decision 0009, offline-sync skill): changes made while Vento can't be reached are kept
// on the device as commands, each with the key the device made and the time it happened, and sent
// in order when the connection is back. The server applies each once and decides the outcome. Only
// the allow-list below can be queued (Mark clean / Mark dirty, brick 7; check-in of an arrival
// already in a room, brick 8); everything else is
// disabled offline with its reason. A command is sent only by the person who made it, so a shared
// device never sends Grace's change under Chiamaka's name.

import { useQueryClient } from '@tanstack/react-query'
import type { CheckInInput } from '@vento/shared'
import { useEffect, useSyncExternalStore } from 'react'
import { api, orpc } from '@/lib/api'
import { isConnectionProblem } from '@/lib/errors'
import { isOnline, markReachable, markUnreachable, onReachabilityChange } from './connection'
import {
  afterAnswer,
  type CheckInCommand,
  type Command,
  failureOf,
  nextToSend,
  type Queued,
  type RoomStatusCommand,
} from './outbox-rules'
import { unseal } from './sealed'
import { getOutboxItem, setOutboxItem } from './store'

export type { CheckInCommand, Command, Queued, RoomStatusCommand }

export const OFFLINE_COMMANDS = ['rooms.setStatus', 'stays.checkIn'] as const

type Sender = (command: Command) => Promise<{ outcome: string; message: string | null }>

const KEY = 'commands'
let items: Queued[] = []
let loaded = false
let flushing = false
let sender: Sender | undefined
let member: string | undefined
// Told after each command the server applied, so screens can read the new state.
let onApplied: (() => void) | undefined
// Told when a queued check-in is sent ("Checking whether Daniel Mensah was checked in…").
let onSending: ((command: CheckInCommand) => void) | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

async function save() {
  await setOutboxItem(KEY, items)
}

async function load() {
  if (loaded) return
  loaded = true
  const saved = await getOutboxItem<Queued[]>(KEY)
  if (saved?.length) {
    // Kept in creation order; anything added before the load finished goes after.
    items = [
      ...saved,
      ...items.filter(
        (item) => !saved.some((s) => s.input.idempotencyKey === item.input.idempotencyKey),
      ),
    ]
    emit()
  }
}

// Sends this person's waiting commands, oldest first, one at a time; stops at the first that
// can't reach Vento and tries again when the connection is back.
export async function flush() {
  if (flushing || !sender || !isOnline()) return
  flushing = true
  try {
    await load()
    for (;;) {
      const next = nextToSend(items, member)
      if (!next) break
      if (next.kind === 'stays.checkIn') onSending?.(next)
      try {
        const result = await sender(next)
        markReachable()
        if (result.outcome === 'applied') onApplied?.()
        items = afterAnswer(
          items,
          next.input.idempotencyKey,
          result.outcome === 'superseded'
            ? { outcome: 'attention', message: result.message ?? `${next.label}: kept as it was.` }
            : { outcome: 'applied' },
        )
      } catch (error) {
        const failure = failureOf(error, isConnectionProblem(error as { status?: number }))
        if (failure === 'offline') {
          markUnreachable()
          break
        }
        // Left waiting: sent again once someone signs in (startOutbox runs then).
        if (failure === 'signed_out') break
        const message = error instanceof Error ? error.message : 'Vento refused this change.'
        items = afterAnswer(items, next.input.idempotencyKey, {
          outcome: 'attention',
          message:
            next.kind === 'stays.checkIn'
              ? `${next.guestName}'s check-in to ${next.roomNumber} couldn't sync: ${message}`
              : `${next.label}: ${message}`,
        })
      }
      await save()
      emit()
    }
  } finally {
    flushing = false
  }
}

// Set once the app knows who is signed in and how to send: queued commands then go out.
export function startOutbox(send: Sender, memberId: string | undefined, applied?: () => void) {
  sender = send
  member = memberId
  onApplied = applied
  void flush()
}

export async function enqueue(command: Command) {
  await load()
  items = [...items, { ...command, state: 'waiting' }]
  await save()
  emit()
}

export async function dismiss(key: string) {
  items = items.filter((item) => item.input.idempotencyKey !== key)
  await save()
  emit()
}

if (typeof window !== 'undefined') {
  // Back online (the browser says so, or a request reached Vento again): send what's waiting.
  onReachabilityChange(() => {
    if (isOnline()) void flush()
  })
  void load()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOutbox(): readonly Queued[] {
  return useSyncExternalStore(subscribe, () => items)
}

// In the signed-in shell: queued changes go out for whoever is signed in now.
export function useOutboxRunner(memberId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!memberId) return
    startOutbox(
      async (command) => {
        if (command.kind === 'rooms.setStatus') {
          const result = await api.rooms.setStatus(command.input)
          return { outcome: result.outcome, message: result.message }
        }
        return sendCheckIn(command)
      },
      memberId,
      () => {
        void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
        void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
      },
    )
  }, [memberId, queryClient])
}

type SealedCheckIn = {
  registrations: CheckInInput['registrations']
  idDocument: CheckInInput['idDocument']
  photo?: { documentId: string; contentType: 'image/jpeg' | 'application/pdf'; base64: string }
}

// A queued check-in: the photo first (stored once by its id), then the check-in that names it. The
// server re-checks everything; a refusal comes back in its words, for a person to read.
async function sendCheckIn(command: CheckInCommand) {
  const open = await unseal<SealedCheckIn>(command.sealed)
  if (open.photo) {
    await api.registrations.uploadIdDocument({
      documentId: open.photo.documentId,
      propertyId: command.input.propertyId,
      contentType: open.photo.contentType,
      source: 'offline',
      data: open.photo.base64,
    })
  }
  const { propertyId: _hotel, ...input } = command.input
  await api.checkIn.checkIn({
    ...input,
    registrations: open.registrations,
    idDocument: open.idDocument,
    source: 'offline',
    printCard: false,
  })
  return { outcome: 'applied', message: null }
}

export function onCheckInSending(listener: ((command: CheckInCommand) => void) | undefined) {
  onSending = listener
}

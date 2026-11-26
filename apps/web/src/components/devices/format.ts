// How devices read on screen: what each kind is for, and when one was last used.
import { DEVICE_KINDS, type DeviceKind } from '@vento/shared'

export const KIND_OPTIONS = (Object.keys(DEVICE_KINDS) as DeviceKind[]).map((kind) => ({
  value: kind,
  label: DEVICE_KINDS[kind].label,
}))

export function lastSeen(iso: string | null): string {
  if (!iso) return 'Not used yet'
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function idleTime(kind: DeviceKind): string {
  const seconds = DEVICE_KINDS[kind].idleSeconds
  return seconds < 120 ? `${seconds} seconds` : `${seconds / 60} minutes`
}

// Shared devices (decision 0022): what each kind is for and how long it waits before signing out.
import { z } from 'zod'

export const DEVICE_KINDS = {
  front_desk: { label: 'Front desk PC', idleSeconds: 300 },
  pos: { label: 'Restaurant & bar tablet', idleSeconds: 90 },
  housekeeping: { label: 'Housekeeping phone', idleSeconds: 300 },
} as const

export type DeviceKind = keyof typeof DEVICE_KINDS
export const deviceKindSchema = z.enum(Object.keys(DEVICE_KINDS) as [DeviceKind, ...DeviceKind[]])

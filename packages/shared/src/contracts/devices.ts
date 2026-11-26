// Shared devices, staff PINs and the lock screen (spec: docs/specs/stage-0-devices-and-pin.md).
// PIN sign-in itself is a Better Auth endpoint (/api/auth/device/pin-sign-in), like other sign-ins.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { deviceKindSchema } from '../devices.ts'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { isAcceptablePin } from '../pin.ts'
import { memberRoleSchema } from '../roles.ts'

export const deviceViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: deviceKindSchema,
  propertyId: idSchema,
  propertyName: z.string(),
  lastSeenAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  revokedReason: z.string().nullable(),
  isThisDevice: z.boolean(),
})
export type DeviceView = z.infer<typeof deviceViewSchema>

export const deviceListSchema = pageQuerySchema.extend({
  // Only this hotel's devices. Without it, every device at an active hotel the caller may see.
  propertyId: idSchema.optional(),
})

const deviceName = z.string().trim().min(2, 'Enter at least 2 characters').max(40)

export const registerDeviceSchema = z.object({
  name: deviceName,
  kind: deviceKindSchema,
  propertyId: idSchema,
})

export const lockScreenSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unregistered') }),
  z.object({ status: z.literal('revoked'), organizationName: z.string() }),
  z.object({
    status: z.literal('ready'),
    device: z.object({ name: z.string(), kind: deviceKindSchema, propertyName: z.string() }),
    people: z.array(
      z.object({ memberId: idSchema, displayName: z.string(), role: memberRoleSchema }),
    ),
  }),
])
export type LockScreen = z.infer<typeof lockScreenSchema>

export const pinSchema = z.string().refine(isAcceptablePin, 'Choose a PIN that is harder to guess')

const ok = z.object({ ok: z.literal(true) })

export const devicesContract = {
  devices: {
    list: oc.input(deviceListSchema).output(pageSchema(deviceViewSchema)),
    // Registers the browser it's called from, and gives it the device cookie.
    register: oc.input(registerDeviceSchema).output(deviceViewSchema),
    rename: oc.input(z.object({ id: idSchema, name: deviceName })).output(deviceViewSchema),
    revoke: oc
      .input(z.object({ id: idSchema, reason: z.string().trim().min(3, 'Say why').max(500) }))
      .output(ok),
    // Public: what this browser's device cookie (if any) shows on the lock screen.
    lockScreen: oc.output(lockScreenSchema),
  },
  pins: {
    // Your own PIN, confirmed with your password.
    set: oc.input(z.object({ pin: pinSchema, password: z.string().min(1).max(128) })).output(ok),
    reset: oc.input(z.object({ memberId: idSchema })).output(ok),
  },
}

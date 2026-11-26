// System procedures: health and, later, version and maintenance status.
import { oc } from '@orpc/contract'
import { z } from 'zod'

export const serviceCheckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), detail: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: serviceCheckSchema,
    storage: serviceCheckSchema,
    // Background jobs: absent where workers don't run (e.g. tests).
    jobs: serviceCheckSchema.optional(),
  }),
  checkedAt: z.iso.datetime(),
})
export type Health = z.infer<typeof healthSchema>

export const systemContract = {
  health: oc.output(healthSchema),
}

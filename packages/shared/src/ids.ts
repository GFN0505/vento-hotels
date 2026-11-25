// Every row id is a UUID v7 (CLAUDE.md non-negotiable 10): time-ordered, so indexes stay compact,
// and safe to generate on a device while offline, before the server has seen the record.
import { v7 } from 'uuid'
import { z } from 'zod'

export const idSchema = z.uuidv7()
export type Id = string

export function newId(): Id {
  return v7()
}

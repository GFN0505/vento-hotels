// The first night a stay holds its current room (decision 0030): its arrival, or the business date
// of an in-house move. Every "is this room free" read compares nights against this, never the
// arrival, so the nights an in-house guest spent in another room don't count against this one.
import { sql } from 'drizzle-orm'
import { stays } from '../db/schema/reservations.ts'

export const roomFromSql = sql<string>`coalesce(${stays.roomFrom}, ${stays.arrival})::text`

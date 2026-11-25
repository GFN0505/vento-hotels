// The API contract: one object per module. The API implements it and the web app calls it through
// the typed oRPC client, so request and response types are defined once, here (non-negotiable 7).
import { systemContract } from './system.ts'

export const contract = {
  system: systemContract,
}
export type Contract = typeof contract

export * from './system.ts'

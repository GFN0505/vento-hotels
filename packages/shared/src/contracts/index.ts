// The API contract: one object per module. The API implements it and the web app calls it through
// the typed oRPC client, so request and response types are defined once, here (non-negotiable 7).
import { governanceContract } from './governance.ts'
import { systemContract } from './system.ts'
import { teamContract } from './team.ts'
import { tenancyContract } from './tenancy.ts'

export const contract = {
  system: systemContract,
  ...tenancyContract,
  ...governanceContract,
  members: { ...tenancyContract.members, ...teamContract.members },
  invitations: teamContract.invitations,
}
export type Contract = typeof contract

export * from './governance.ts'
export * from './system.ts'
export * from './team.ts'
export * from './tenancy.ts'

// The API contract: one object per module. The API implements it and the web app calls it through
// the typed oRPC client, so request and response types are defined once, here (non-negotiable 7).
import { devicesContract } from './devices.ts'
import { financeContract } from './finance.ts'
import { governanceContract } from './governance.ts'
import { ratesContract } from './rates.ts'
import { roomsContract } from './rooms.ts'
import { systemContract } from './system.ts'
import { teamContract } from './team.ts'
import { tenancyContract } from './tenancy.ts'

export const contract = {
  system: systemContract,
  ...tenancyContract,
  ...governanceContract,
  members: { ...tenancyContract.members, ...teamContract.members },
  invitations: teamContract.invitations,
  ...devicesContract,
  ...roomsContract,
  ...financeContract,
  ...ratesContract,
}
export type Contract = typeof contract

export * from './devices.ts'
export * from './finance.ts'
export * from './governance.ts'
export * from './rates.ts'
export * from './reservations.ts'
export * from './rooms.ts'
export * from './system.ts'
export * from './team.ts'
export * from './tenancy.ts'

// Sign-in client for Better Auth at /api/auth on the same origin.
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  // twoFactorClient: sign-in answers `twoFactorRedirect` when a code is needed (decision 0023);
  // the sign-in page shows the code step itself, so no redirect handler here.
  plugins: [organizationClient(), twoFactorClient()],
})

export type Session = typeof authClient.$Infer.Session

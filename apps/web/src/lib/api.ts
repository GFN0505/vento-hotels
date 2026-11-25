// The typed API client. Types come from the shared contract, so a mismatch with the API is a
// compile error (non-negotiable 7). Same origin as the page, so the session cookie goes along.
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { Contract } from '@vento/shared'

const link = new RPCLink({ url: () => `${window.location.origin}/rpc` })

export const api: ContractRouterClient<Contract> = createORPCClient(link)
export const orpc = createTanstackQueryUtils(api)

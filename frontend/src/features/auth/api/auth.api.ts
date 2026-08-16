import { http } from '../../../shared/api/http'
import { apiKeyListSchema, apiKeySchema, authTokensSchema } from '../schemas/login.schema'
import { tenantSchema } from '../schemas/register.schema'
import type { AuthTokens, LoginPayload, RegisterPayload, Tenant } from '../types/auth.types'

export async function register(payload: RegisterPayload): Promise<Tenant> {
  const response = await http.post<unknown>('/tenants/register', payload)

  return tenantSchema.parse(response.data)
}

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  const response = await http.post<unknown>('/tenants/login', payload)

  return authTokensSchema.parse(response.data)
}

/**
 * The login access token only authorizes tenant/API-key management, never
 * the log endpoints — those require an API key. Reuse an existing active
 * key if the tenant already has one, otherwise mint a new one.
 */
export async function ensureApiKey(accessToken: string): Promise<string> {
  const authHeader = { Authorization: `Bearer ${accessToken}` }

  const listResponse = await http.get<unknown>('/tenants/api-keys', { headers: authHeader })
  const { api_keys: apiKeys } = apiKeyListSchema.parse(listResponse.data)
  const activeKey = apiKeys.find((apiKey) => apiKey.status === 'active')
  if (activeKey) {
    return activeKey.key
  }

  const createResponse = await http.post<unknown>('/tenants/api-keys', {}, { headers: authHeader })
  return apiKeySchema.parse(createResponse.data).key
}

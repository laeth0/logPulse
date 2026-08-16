import { http } from '../../../shared/api/http'
import { tenantSchema } from '../schemas/register.schema'
import type { RegisterPayload, Tenant } from '../types/auth.types'

export async function register(payload: RegisterPayload): Promise<Tenant> {
  const response = await http.post<unknown>('/tenants/register', payload)

  return tenantSchema.parse(response.data)
}

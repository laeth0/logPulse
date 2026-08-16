export interface RegisterPayload {
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface Tenant {
  id: string
  email: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface ApiKey {
  id: string
  key: string
  status: 'active' | 'revoked'
  created_at: string
}

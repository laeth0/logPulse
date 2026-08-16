import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const authTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
})

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  status: z.enum(['active', 'revoked']),
  created_at: z.string(),
})

export const apiKeyListSchema = z.object({
  api_keys: z.array(apiKeySchema),
})

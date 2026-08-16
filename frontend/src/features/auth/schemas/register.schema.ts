import { z } from 'zod'

export const registerSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const tenantSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
})

export type RegisterFormData = z.infer<typeof registerSchema>

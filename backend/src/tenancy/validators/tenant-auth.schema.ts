import { z } from 'zod';

const MIN_PASSWORD_LENGTH = 8;

const emailSchema = z.email({ error: 'email must be a valid email address' });

const passwordSchema = z
  .string({ error: 'password is required' })
  .min(MIN_PASSWORD_LENGTH, {
    error: `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  });

export const registerTenantSchema = z.object(
  {
    email: emailSchema,
    password: passwordSchema,
  },
  { error: 'request body must be an object' },
);

export const loginTenantSchema = z.object(
  {
    email: emailSchema,
    password: passwordSchema,
  },
  { error: 'request body must be an object' },
);

export const refreshTokenSchema = z.object(
  {
    refresh_token: z
      .string({ error: 'refresh_token is required' })
      .min(1, { error: 'refresh_token is required' }),
  },
  { error: 'request body must be an object' },
);

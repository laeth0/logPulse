import type { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';

export function expectAuthTokens(tokens: AuthTokensDto): void {
  expect(typeof tokens.access_token).toBe('string');
  expect(tokens.access_token).not.toHaveLength(0);
  expect(typeof tokens.refresh_token).toBe('string');
  expect(tokens.refresh_token).not.toHaveLength(0);
  expect(tokens.token_type).toBe('Bearer');
  expect(typeof tokens.expires_in).toBe('number');
  expect(tokens.expires_in).toBeGreaterThan(0);
}

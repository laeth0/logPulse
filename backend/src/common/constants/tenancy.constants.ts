export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export const LOADGEN_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export const LOADGEN_TENANT_EMAIL = 'loadgen@internal.logpulse';

export const LOADGEN_TENANT_PASSWORD =
  process.env.LOADGEN_TENANT_PASSWORD ?? 'please-change-me-in-production';

export const API_KEY_PREFIX = 'lp_';

export const API_KEY_HEADER = 'x-api-key';

export const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.JWT_ACCESS_TOKEN_TTL_SECONDS ?? 900,
);
export const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.JWT_REFRESH_TOKEN_TTL_DAYS ?? 7,
);

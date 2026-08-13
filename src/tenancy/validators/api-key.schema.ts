import { z } from 'zod';

// POST /tenants/api-keys takes no meaningful body today (contracts/
// api-keys-api.md: "no body required") — nothing to validate, so accept
// whatever is sent (including nothing at all) rather than reject on shape.
export const createApiKeySchema = z.unknown();

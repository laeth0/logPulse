import { z } from 'zod';

export const createApiKeySchema = z.object({}).strict();

export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>;

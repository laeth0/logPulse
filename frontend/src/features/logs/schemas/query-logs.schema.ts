import { z } from 'zod'

import { attributeValueSchema, logLevelSchema } from './log-entry.schema'

export const logResponseSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: logLevelSchema,
  service: z.string(),
  message: z.string(),
  attributes: z.record(z.string(), attributeValueSchema),
})

export const queryLogsResponseSchema = z.object({
  logs: z.array(logResponseSchema),
  next_cursor: z.string().nullable(),
})

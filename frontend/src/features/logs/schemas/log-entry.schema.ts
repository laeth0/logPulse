import { z } from 'zod'

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const draftLogEntrySchema = z.object({
  timestamp: z
    .string()
    .min(1, 'Timestamp is required')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid timestamp'),
  level: logLevelSchema,
  service: z.string().trim().min(1, 'Service is required'),
  message: z.string().trim().min(1, 'Message is required'),
})

export const rejectedLogSchema = z.object({
  index: z.number(),
  reason: z.string(),
})

export const ingestResponseSchema = z.object({
  accepted: z.number(),
  rejected: z.array(rejectedLogSchema),
})

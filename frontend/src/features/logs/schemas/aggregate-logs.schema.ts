import { z } from 'zod'

export const aggregateBucketSchema = z.object({
  start: z.string(),
  group: z.string().nullable(),
  count: z.number(),
})

export const aggregateLogsResponseSchema = z.object({
  buckets: z.array(aggregateBucketSchema),
})

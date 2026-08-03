import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import { LogLevel } from '@/logs/enums/log-level.enum';

export class AggregateLogsDto {
  @ApiPropertyOptional({ example: 'checkout' })
  service?: string;

  @ApiPropertyOptional({ enum: LogLevel, example: LogLevel.ERROR })
  level?: LogLevel;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-07-20T14:00:00Z',
  })
  since: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-07-20T15:00:00Z',
  })
  until: Date;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { region: 'eu-west' },
  })
  attributes: Record<string, string>;

  @ApiPropertyOptional({ example: 'declined' })
  q?: string;

  @ApiProperty({
    enum: AggregationBucket,
    example: AggregationBucket.ONE_MINUTE,
  })
  bucket: AggregationBucket;

  @ApiPropertyOptional({
    enum: AggregationGroup,
    example: AggregationGroup.SERVICE,
  })
  groupBy?: AggregationGroup;
}

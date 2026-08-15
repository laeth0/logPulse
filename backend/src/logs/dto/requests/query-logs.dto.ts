import { ApiPropertyOptional } from '@nestjs/swagger';

import { LogLevel } from '@/logs/enums/log-level.enum';

export class QueryLogsDto {
  @ApiPropertyOptional({ example: 'checkout' })
  service?: string;

  @ApiPropertyOptional({ enum: LogLevel, example: LogLevel.ERROR })
  level?: LogLevel;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-07-20T14:00:00Z',
  })
  since?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-07-20T15:00:00Z',
  })
  until?: Date;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { user_id: '42' },
  })
  attributes: Record<string, string>;

  @ApiPropertyOptional({ example: 'declined' })
  q?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 1000 })
  limit: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous response',
  })
  cursor?: string;
}

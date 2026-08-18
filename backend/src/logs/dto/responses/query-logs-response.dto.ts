import { ApiProperty } from '@nestjs/swagger';

import { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-attribute-value.type';

export class LogResponseDto {
  @ApiProperty({ example: '12345' })
  id: string;

  @ApiProperty({ example: '2026-07-20T14:32:01.123Z', format: 'date-time' })
  timestamp: string;

  @ApiProperty({ enum: LogLevel, example: LogLevel.ERROR })
  level: LogLevel;

  @ApiProperty({ example: 'checkout' })
  service: string;

  @ApiProperty({ example: 'payment declined' })
  message: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    example: { user_id: '42' },
  })
  attributes: Record<string, LogAttributeValue>;
}

export class QueryLogsResponseDto {
  @ApiProperty({ type: [LogResponseDto] })
  logs: LogResponseDto[];

  @ApiProperty({
    nullable: true,
    example:
      'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTIwVDE0OjMyOjAxLjEyM1oiLCJpZCI6IjEyMzQ1In0',
  })
  next_cursor: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-attribute-value.type';

export class LogEntryDto {
  @ApiProperty({
    example: '2026-07-20T14:32:01.123Z',
    format: 'date-time',
  })
  timestamp: string;

  @ApiProperty({ enum: LogLevel, example: LogLevel.ERROR })
  level: LogLevel;

  @ApiProperty({ example: 'checkout' })
  service: string;

  @ApiProperty({ example: 'payment declined' })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    example: { user_id: '42', region: 'eu-west', retries: 3 },
  })
  attributes: Record<string, LogAttributeValue>;
}

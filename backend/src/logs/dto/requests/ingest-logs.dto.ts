import { ApiProperty } from '@nestjs/swagger';

import { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';

export class IngestLogsDto {
  @ApiProperty({ type: [LogEntryDto] })
  logs: unknown[];
}

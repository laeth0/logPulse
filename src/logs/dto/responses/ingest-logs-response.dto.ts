import { ApiProperty } from '@nestjs/swagger';

export class RejectedLogDto {
  @ApiProperty({ example: 3 })
  index: number;

  @ApiProperty({ example: "invalid level: 'critical'" })
  reason: string;
}

export class IngestLogsResponseDto {
  @ApiProperty({ example: 9 })
  accepted: number;

  @ApiProperty({ type: [RejectedLogDto] })
  rejected: RejectedLogDto[];
}

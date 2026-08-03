import { ApiProperty } from '@nestjs/swagger';

export class AggregateBucketDto {
  @ApiProperty({ example: '2026-07-20T14:00:00.000Z', format: 'date-time' })
  start: string;

  @ApiProperty({ nullable: true, example: 'checkout' })
  group: string | null;

  @ApiProperty({ example: 118 })
  count: number;
}

export class AggregateLogsResponseDto {
  @ApiProperty({ type: [AggregateBucketDto] })
  buckets: AggregateBucketDto[];
}

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { IngestLogsDto } from '@/logs/dto/requests/ingest-logs.dto';
import { AggregateLogsResponseDto } from '@/logs/dto/responses/aggregate-logs-response.dto';
import { IngestLogsResponseDto } from '@/logs/dto/responses/ingest-logs-response.dto';
import { QueryLogsResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import { LogLevel } from '@/logs/enums/log-level.enum';
import { LogAggregationService } from '@/logs/services/log-aggregation.service';
import { LogIngestionService } from '@/logs/services/log-ingestion.service';
import { LogQueryService } from '@/logs/services/log-query.service';
import { CurrentTenantId } from '@/tenancy/decorators/current-tenant-id.decorator';
import { ApiKeyAuthGuard } from '@/tenancy/guards/api-key-auth.guard';

@ApiTags('logs')
@Controller('logs')
@UseGuards(ApiKeyAuthGuard)
export class LogsController {
  constructor(
    private readonly ingestionService: LogIngestionService,
    private readonly queryService: LogQueryService,
    private readonly aggregationService: LogAggregationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Ingest a batch of structured logs' })
  @ApiBody({ type: IngestLogsDto })
  @ApiOkResponse({ type: IngestLogsResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed request or every batch entry was rejected',
  })
  async ingest(
    @Body() body: unknown,
    @CurrentTenantId() tenantId: string,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.ingestionService.ingest(body, tenantId);
    const status =
      result.accepted === 0 ? HttpStatus.BAD_REQUEST : HttpStatus.OK;
    response.status(status).json(result);
  }

  @Get('aggregate')
  @ApiOperation({ summary: 'Aggregate logs into time buckets' })
  @ApiQuery({ name: 'since', required: true, type: String })
  @ApiQuery({ name: 'until', required: true, type: String })
  @ApiQuery({ name: 'bucket', required: true, enum: AggregationBucket })
  @ApiQuery({ name: 'group_by', required: false, enum: AggregationGroup })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'level', required: false, enum: LogLevel })
  @ApiQuery({ name: 'attr.<key>', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiOkResponse({ type: AggregateLogsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid aggregation parameters' })
  aggregate(
    @Query() query: Record<string, unknown>,
    @CurrentTenantId() tenantId: string,
  ): Promise<AggregateLogsResponseDto> {
    return this.aggregationService.aggregate(query, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Query logs using combinable filters' })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'level', required: false, enum: LogLevel })
  @ApiQuery({ name: 'since', required: false, type: String })
  @ApiQuery({ name: 'until', required: false, type: String })
  @ApiQuery({ name: 'attr.<key>', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: QueryLogsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  query(
    @Query() query: Record<string, unknown>,
    @CurrentTenantId() tenantId: string,
  ): Promise<QueryLogsResponseDto> {
    return this.queryService.query(query, tenantId);
  }
}

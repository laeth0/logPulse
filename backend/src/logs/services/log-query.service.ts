import { Injectable } from '@nestjs/common';

import { CursorService } from '@/logs/cursor/cursor.service';
import type { QueryLogsResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import type { RawLogRow } from '@/logs/interfaces/log-result.interface';
import { mapLogToResponse } from '@/logs/mappers/log.mapper';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogQueryValidator } from '@/logs/validators/log-query.validator';

@Injectable()
export class LogQueryService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly cursorService: CursorService,
    private readonly logQueryValidator: LogQueryValidator,
  ) {}

  /**
   * Validates query parameters, decodes any keyset cursor, and fetches a paginated page of logs for a tenant.
   *
   * @param value - The raw query object from the HTTP request.
   * @param tenantId - The authenticated tenant ID.
   * @returns A promise resolving to the query logs response DTO containing logs and next cursor.
   */
  async query(value: unknown, tenantId: string): Promise<QueryLogsResponseDto> {
    const query = this.logQueryValidator.validateQuery(value);
    const cursor =
      query.cursor !== undefined
        ? this.cursorService.decode(query.cursor)
        : undefined;
    const page = await this.logRepository.findPage({
      tenantId,
      service: query.service,
      level: query.level,
      since: query.since,
      until: query.until,
      attributes: query.attributes,
      q: query.q,
      limit: query.limit,
      cursor,
    });

    return {
      logs: page.logs.map(mapLogToResponse),
      next_cursor: this.createNextCursor(page.logs, page.hasMore),
    };
  }

  /**
   * Creates an opaque base64url keyset cursor pointing to the last log in the current page.
   *
   * @param logs - The array of raw log rows returned in the page.
   * @param hasMore - Whether additional records exist beyond the current page.
   * @returns The encoded next cursor string or `null` if there are no more records.
   */
  private createNextCursor(logs: RawLogRow[], hasMore: boolean): string | null {
    const lastLog = logs.at(-1);
    if (!hasMore || !lastLog) {
      return null;
    }

    return this.cursorService.encode({
      timestamp: lastLog.timestamp.toISOString(),
      id: lastLog.id,
    });
  }
}

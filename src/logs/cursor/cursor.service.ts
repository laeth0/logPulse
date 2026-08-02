import { BadRequestException, Injectable } from '@nestjs/common';
import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';

@Injectable()
export class CursorService {
  encode(payload: CursorPayload): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  decode(cursor: string): CursorPayload {
    let json: string;

    try {
      json = Buffer.from(cursor, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    } catch {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('timestamp' in parsed) ||
      !('id' in parsed) ||
      typeof (parsed as Record<string, unknown>).timestamp !== 'string' ||
      typeof (parsed as Record<string, unknown>).id !== 'string'
    ) {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    const payload = parsed as CursorPayload;

    if (isNaN(Date.parse(payload.timestamp))) {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    return payload;
  }
}

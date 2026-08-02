import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';

const INVALID_CURSOR_MESSAGE = 'Invalid or malformed cursor';

function isCursorPayload(value: unknown): value is CursorPayload {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('timestamp' in value) ||
    !('id' in value)
  ) {
    return false;
  }

  return (
    typeof value.timestamp === 'string' &&
    !Number.isNaN(Date.parse(value.timestamp)) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0
  );
}

@Injectable()
export class CursorService {
  encode(payload: CursorPayload): string {
    const serializedPayload = JSON.stringify(payload);
    return Buffer.from(serializedPayload, 'utf8').toString('base64url');
  }

  decode(cursor: string): CursorPayload {
    const payload = this.parseCursor(cursor);

    if (!isCursorPayload(payload)) {
      throw new BadRequestException(INVALID_CURSOR_MESSAGE);
    }

    return payload;
  }

  private parseCursor(cursor: string): unknown {
    try {
      const bytes = Buffer.from(cursor, 'base64url');

      if (bytes.length === 0 || bytes.toString('base64url') !== cursor) {
        return undefined;
      }

      const serializedPayload = new TextDecoder('utf-8', {
        fatal: true,
      }).decode(bytes);
      const payload: unknown = JSON.parse(serializedPayload);

      return payload;
    } catch {
      return undefined;
    }
  }
}

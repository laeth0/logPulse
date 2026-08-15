import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';

import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';
import { cursorPayloadSchema } from '@/logs/validators/cursor-payload.schema';

@Injectable()
export class CursorService {
  encode(payload: CursorPayload): string {
    const serializedPayload = JSON.stringify(payload);
    return Buffer.from(serializedPayload, 'utf8').toString('base64url');
  }

  decode(cursor: string): CursorPayload {
    const result = cursorPayloadSchema.safeParse(this.parseCursor(cursor));

    if (!result.success) {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    return result.data;
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

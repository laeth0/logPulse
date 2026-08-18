import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';

import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';
import { cursorPayloadSchema } from '@/logs/validators/cursor-payload.schema';

@Injectable()
export class CursorService {
  encode(payload: CursorPayload): string {
    const jsonPayload = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(jsonPayload, 'utf8');

    return payloadBuffer.toString('base64url');
  }

  decode(cursor: string): CursorPayload {
    const validationResult = cursorPayloadSchema.safeParse(
      this.parseCursor(cursor),
    );

    if (!validationResult.success) {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    return validationResult.data;
  }

  private parseCursor(cursor: string): unknown {
    try {
      const cursorBuffer = Buffer.from(cursor, 'base64url');

      if (
        cursorBuffer.length === 0 ||
        cursorBuffer.toString('base64url') !== cursor
      ) {
        return undefined;
      }

      const jsonString = new TextDecoder('utf-8', {
        fatal: true,
      }).decode(cursorBuffer);

      const parsedPayload: unknown = JSON.parse(jsonString);

      return parsedPayload;
    } catch {
      return undefined;
    }
  }
}

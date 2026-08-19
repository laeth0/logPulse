import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';

import type { CursorPayload } from '@/logs/interfaces/cursor-payload.interface';
import { cursorPayloadSchema } from '@/logs/validators/cursor-payload.schema';

@Injectable()
export class CursorService {
  /**
   * Encodes a cursor payload object into a URL-safe base64 string.
   *
   * @param payload - The cursor payload containing timestamp and log ID.
   * @returns A base64url-encoded string representation of the cursor.
   */
  encode(payload: CursorPayload): string {
    const jsonPayload = JSON.stringify(payload);
    const payloadBuffer = Buffer.from(jsonPayload, 'utf8');

    return payloadBuffer.toString('base64url');
  }

  /**
   * Decodes and validates a base64url-encoded cursor string into a typed CursorPayload.
   *
   * @param cursor - The raw base64url cursor string from query parameters.
   * @throws {BadRequestException} If the cursor is malformed, invalid base64, or fails schema validation.
   * @returns The validated CursorPayload object.
   */
  decode(cursor: string): CursorPayload {
    const validationResult = cursorPayloadSchema.safeParse(
      this.parseCursor(cursor),
    );

    if (!validationResult.success) {
      throw new BadRequestException('Invalid or malformed cursor');
    }

    return validationResult.data;
  }

  /**
   * Safely parses a base64url-encoded cursor string to an unknown JSON structure.
   * Ensures strict canonical base64url encoding and valid UTF-8 byte sequences.
   *
   * @param cursor - The raw cursor string to parse.
   * @returns The parsed JSON object or `undefined` if malformed.
   */
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

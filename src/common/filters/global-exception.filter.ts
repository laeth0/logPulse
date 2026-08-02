import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter that normalizes all thrown exceptions into the
 * API error envelope required by the project specification:
 *
 *   { "error": "<description>" }
 *
 * Behavior:
 *  - HttpException  → preserves the HTTP status code; extracts the message.
 *  - Any other Error → responds with HTTP 500 and a generic message so that
 *    internal details are never leaked to the client.
 *
 * Registered globally in main.ts via app.useGlobalFilters().
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      // getResponse() may return a string or a NestJS validation-error object.
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body
      ) {
        // ValidationPipe produces { message: string[] | string, ... }
        const raw = (body as Record<string, unknown>).message;
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      } else {
        message = exception.message;
      }
    } else {
      // Unexpected / unhandled error — log the full stack, hide from client.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ error: message });
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter that normalizes all thrown exceptions into the
 * API error envelope required by the project specification:
 *
 *   { "error": "<description>" }
 *
 * Behavior:
 *  - HttpException  → preserves the HTTP status code; extracts the message.
 *  - External 4xx   → preserves client errors raised before a controller runs.
 *  - Any other Error → responds with HTTP 500 and a generic message.
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
    const externalClientError = getExternalClientError(exception);

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
        const raw = Reflect.get(body, 'message');
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      } else {
        message = exception.message;
      }
    } else if (externalClientError) {
      status = externalClientError.status;
      message = externalClientError.message;
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

interface ExternalClientError {
  status: number;
  message: string;
}

function getExternalClientError(
  exception: unknown,
): ExternalClientError | undefined {
  if (!(exception instanceof Error) || !('statusCode' in exception)) {
    return undefined;
  }

  const statusCode: unknown = exception.statusCode;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
    ? { status: statusCode, message: exception.message }
    : undefined;
}

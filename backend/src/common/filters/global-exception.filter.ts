import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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

      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body
      ) {
        const raw = Reflect.get(body, 'message');
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      } else {
        message = exception.message;
      }

      const retryAfterSeconds = getRetryAfterSeconds(exception);
      if (retryAfterSeconds !== undefined) {
        response.set('Retry-After', String(retryAfterSeconds));
      }
    } else if (externalClientError) {
      status = externalClientError.status;
      message = externalClientError.message;
    } else {
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

function getRetryAfterSeconds(exception: HttpException): number | undefined {
  const retryAfterSeconds: unknown = Reflect.get(
    exception,
    'retryAfterSeconds',
  );
  return typeof retryAfterSeconds === 'number' ? retryAfterSeconds : undefined;
}

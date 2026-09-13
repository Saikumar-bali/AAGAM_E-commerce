import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('SentryExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Report server-side 5xx errors and unhandled runtime crashes to Sentry
    if (status >= 500 && process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setTag('path', request.url);
        scope.setTag('method', request.method);
        if ((request as any).user?.id) {
          scope.setUser({ id: (request as any).user.id, role: (request as any).user.role });
        }
        scope.setExtra('query', request.query);
        scope.setExtra('headers', {
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        });
        Sentry.captureException(exception);
      });

      this.logger.error(
        `[Sentry Reported] ${request.method} ${request.url} failed with ${status}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Preserve standard NestJS error response structure
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        return response.status(status).json(res);
      }
      return response.status(status).json({
        statusCode: status,
        message: res,
      });
    }

    // Handle unexpected runtime error
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : exception instanceof Error
        ? exception.message
        : 'Internal server error';

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/library';

@Catch(
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Default response
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';

    // Initialization errors typically mean DB is unreachable / env wrong.
    if (exception instanceof PrismaClientInitializationError) {
      statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      message =
        'Database connection failed. Check Postgres is running and DATABASE_URL is correct. Then run: npm -w @aagam/database run db:push';
    }

    // Known request errors usually point to schema mismatch (missing table/column) or constraints.
    if (exception instanceof PrismaClientKnownRequestError) {
      if (exception.code === 'P2021' || exception.code === 'P2022') {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
        message =
          'Database schema is out of sync (missing table/column). Run: npm -w @aagam/database run db:push';
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Record not found';
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        message = exception.message;
      }
    }

    return response.status(statusCode).json({
      statusCode,
      message,
      error: exception?.code || exception?.name || 'PrismaError',
    });
  }
}


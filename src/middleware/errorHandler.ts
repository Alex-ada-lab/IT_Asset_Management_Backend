import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

/**
 * Centralised Express error-handling middleware.
 *
 * Must be registered AFTER all routes so that errors thrown (or passed via
 * `next(err)`) from any handler are caught here.
 *
 * Behaviour:
 *  - Known `AppError` subclasses → respond with their `statusCode` and message.
 *  - Unknown errors in production → respond with 500 and a generic message
 *    (stack traces are never leaked to the client in production).
 *  - Unknown errors in development → include the stack trace in the response
 *    body to aid debugging.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // Unknown / unexpected error
  console.error('[errorHandler] Unhandled error:', err);

  res.status(500).json({
    error: 'Internal server error',
    ...(isProduction ? {} : { detail: err instanceof Error ? err.stack : String(err) }),
  });
}

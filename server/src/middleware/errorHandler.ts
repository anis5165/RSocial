import { Request, Response, NextFunction } from 'express';
import { isAppError } from '../utils/errors';
import { fail } from '../utils/response';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (isAppError(err)) {
    logger.warn('app_error', {
      requestId: req.requestId,
      code: err.code,
      message: err.message,
      status: err.statusCode,
    });
    return fail(res, err.code, err.message, err.statusCode);
  }

  logger.error('unhandled_error', {
    requestId: req.requestId,
    message: err instanceof Error ? err.message : 'Unknown error',
    stack: isProd ? undefined : err instanceof Error ? err.stack : undefined,
  });

  return fail(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}

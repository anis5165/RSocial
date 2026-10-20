import { Request, Response, NextFunction } from 'express';
import { isAppError } from '../utils/errors';
import { fail } from '../utils/response';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

function isMysqlUnreachable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: string }).code) : '';
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ENETUNREACH' ||
    code === 'EAI_AGAIN'
  );
}

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

  if (isMysqlUnreachable(err)) {
    logger.error('database_unreachable', {
      requestId: req.requestId,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return fail(
      res,
      'DB_UNAVAILABLE',
      'Database is not reachable. Login cannot run until MySQL accepts connections from this host.',
      503
    );
  }

  logger.error('unhandled_error', {
    requestId: req.requestId,
    message: err instanceof Error ? err.message : 'Unknown error',
    stack: isProd ? undefined : err instanceof Error ? err.stack : undefined,
  });

  return fail(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}

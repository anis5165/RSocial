import { Request, Response, NextFunction } from 'express';
import { randomToken } from '../utils/crypto';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomToken(8);
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

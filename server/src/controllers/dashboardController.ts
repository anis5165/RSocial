import { Request, Response, NextFunction } from 'express';
import { getDashboard } from '../services/dashboard/dashboardService';
import { ok } from '../utils/response';

export async function dashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getDashboard(req.user!.id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}

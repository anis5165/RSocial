import { Request, Response, NextFunction } from 'express';
import {
  disconnectAccount,
  handleInstagramCallback,
  listConnectedAccounts,
  startInstagramConnect,
} from '../services/accounts/accountsService';
import { ok } from '../utils/response';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { getSessionUser } from '../services/auth/session';

export async function listAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const accounts = await listConnectedAccounts(req.user!.id);
    return ok(res, { accounts });
  } catch (err) {
    return next(err);
  }
}

export async function connectInstagram(req: Request, res: Response, next: NextFunction) {
  try {
    const url = await startInstagramConnect(req.user!.id);
    return ok(res, { url });
  } catch (err) {
    return next(err);
  }
}

export async function instagramCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const error = req.query.error;

    if (error) {
      return res.redirect(
        `${env.APP_BASE_URL}/accounts?error=${encodeURIComponent(String(error))}`
      );
    }
    if (!code || !state) {
      throw new AppError('OAUTH_INVALID', 'Missing OAuth code or state.', 400);
    }

    const sessionUser = await getSessionUser(req);
    await handleInstagramCallback({
      code,
      state,
      sessionUserId: sessionUser?.id,
    });

    return res.redirect(`${env.APP_BASE_URL}/accounts?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth failed';
    return res.redirect(
      `${env.APP_BASE_URL}/accounts?error=${encodeURIComponent(message)}`
    );
  }
}

export async function removeAccount(req: Request, res: Response, next: NextFunction) {
  try {
    await disconnectAccount(req.params.id, req.user!.id);
    return ok(res, { disconnected: true });
  } catch (err) {
    return next(err);
  }
}

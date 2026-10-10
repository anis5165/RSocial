import { Router } from 'express';
import * as accounts from '../controllers/accountsController';
import { requireAuth } from '../middleware/auth';
import { oauthLimiter } from '../middleware/rateLimit';

const router = Router();

router.get('/', requireAuth, accounts.listAccounts);
router.get('/instagram/connect', requireAuth, oauthLimiter, accounts.connectInstagram);
router.get('/instagram/callback', oauthLimiter, accounts.instagramCallback);
router.delete('/:id', requireAuth, accounts.removeAccount);

export default router;

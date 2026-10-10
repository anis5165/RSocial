import { Router } from 'express';
import * as auth from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/login', loginLimiter, auth.login);
router.post('/register', loginLimiter, auth.register);
router.post('/logout', auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;

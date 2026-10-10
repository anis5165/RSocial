import { Router } from 'express';
import * as settings from '../controllers/settingsController';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, settings.get);
router.patch('/', requireAuth, settings.patch);
export default router;

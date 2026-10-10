import { Router } from 'express';
import { dashboard } from '../controllers/dashboardController';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, dashboard);
export default router;

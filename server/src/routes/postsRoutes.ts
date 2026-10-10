import { Router } from 'express';
import * as posts from '../controllers/postsController';
import { requireAuth } from '../middleware/auth';
import { publishLimiter } from '../middleware/rateLimit';

const router = Router();

router.get('/', requireAuth, posts.list);
router.post('/', requireAuth, posts.create);
router.get('/:id', requireAuth, posts.getOne);
router.patch('/:id', requireAuth, posts.patch);
router.post('/:id/publish', requireAuth, publishLimiter, posts.publish);
router.post('/:id/schedule', requireAuth, posts.schedule);
router.post('/:id/cancel', requireAuth, posts.cancel);
router.post('/:id/retry', requireAuth, publishLimiter, posts.retry);

export default router;

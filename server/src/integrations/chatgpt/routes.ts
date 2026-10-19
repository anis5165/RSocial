import { Router } from 'express';
import { requireChatgptBearer } from './auth/bearerAuth';
import {
  cancelScheduled,
  createPost,
  getStatus,
  listAccounts,
  listScheduled,
  publishPostAction,
  retryPostAction,
  schedulePostAction,
  uploadMedia,
} from './controllers/actionsController';
import {
  chatgptPublishLimiter,
  chatgptReadLimiter,
  chatgptUploadLimiter,
  chatgptWriteLimiter,
} from './rateLimit';
import { openApiDocument } from './openapi';

const router = Router();

router.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument());
});

router.get('/v1/accounts', requireChatgptBearer, chatgptReadLimiter, listAccounts);
router.get('/v1/posts/scheduled', requireChatgptBearer, chatgptReadLimiter, listScheduled);
router.get('/v1/posts/status', requireChatgptBearer, chatgptReadLimiter, getStatus);

router.post('/v1/media/upload', requireChatgptBearer, chatgptUploadLimiter, uploadMedia);
router.post('/v1/posts', requireChatgptBearer, chatgptWriteLimiter, createPost);
router.post('/v1/posts/schedule', requireChatgptBearer, chatgptWriteLimiter, schedulePostAction);
router.post('/v1/posts/publish', requireChatgptBearer, chatgptPublishLimiter, publishPostAction);
router.post('/v1/posts/cancel', requireChatgptBearer, chatgptWriteLimiter, cancelScheduled);
router.post('/v1/posts/retry', requireChatgptBearer, chatgptPublishLimiter, retryPostAction);

export default router;

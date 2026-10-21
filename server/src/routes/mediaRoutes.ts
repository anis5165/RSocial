import { Router } from 'express';
import multer from 'multer';
import * as media from '../controllers/mediaController';
import { requireAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

const router = Router();

router.get('/', requireAuth, media.list);
router.post('/', requireAuth, uploadLimiter, upload.single('file'), media.upload);
router.post('/chatgpt', uploadLimiter, upload.any(), media.uploadChatGPT);
router.get('/:id', requireAuth, media.getOne);
router.delete('/:id', requireAuth, media.remove);

export default router;

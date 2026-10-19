import rateLimit from 'express-rate-limit';

const jsonLimit = (max: number, message: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Prefer authenticated user id when present (set by requireChatgptBearer)
    keyGenerator: (req) => {
      if (req.user?.id) return `user:${req.user.id}`;
      return `ip:${req.ip || 'unknown'}`;
    },
    validate: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message },
    },
  });

export const chatgptReadLimiter = jsonLimit(120, 'Too many read requests. Try again later.');
export const chatgptWriteLimiter = jsonLimit(60, 'Too many write requests. Try again later.');
export const chatgptUploadLimiter = jsonLimit(40, 'Too many uploads. Try again later.');
export const chatgptPublishLimiter = jsonLimit(20, 'Too many publish requests. Try again later.');

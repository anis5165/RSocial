import cron from 'node-cron';
import { logger } from '../../utils/logger';
import {
  claimDueScheduledPost,
  publishClaimedPost,
} from '../posts/publishService';

let started = false;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    // Process up to a few due posts per minute
    for (let i = 0; i < 5; i++) {
      const claimed = await claimDueScheduledPost();
      if (!claimed) break;

      logger.info('scheduler_claimed_post', {
        postId: claimed.postId,
        userId: claimed.userId,
      });

      try {
        await publishClaimedPost(claimed.postId, claimed.userId, claimed.lockToken);
        logger.info('scheduler_publish_ok', { postId: claimed.postId });
      } catch (err) {
        logger.error('scheduler_publish_error', {
          postId: claimed.postId,
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  } catch (err) {
    logger.error('scheduler_tick_error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  // Every minute
  cron.schedule('* * * * *', () => {
    void tick();
  });
  logger.info('scheduler_started');
}

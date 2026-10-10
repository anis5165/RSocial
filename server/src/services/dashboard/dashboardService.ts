import type { DashboardData } from '@routism/shared';
import { queryRows } from '../../db/pool';
import { listConnectedAccounts } from '../accounts/accountsService';
import { listPosts } from '../posts/postsService';
import { utcToIso } from '../../utils/time';

export async function getDashboard(userId: string): Promise<DashboardData> {
  const statsRows = await queryRows(
    `SELECT
       COUNT(*) AS totalPosts,
       SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM rs_posts
     WHERE user_id = ?`,
    [userId]
  );
  const s = statsRows[0];

  const recentPosts = await listPosts(userId, { limit: 8 });
  const allScheduled = await listPosts(userId, { status: 'scheduled', limit: 20 });
  const upcomingPosts = allScheduled
    .filter((p) => p.scheduledAt)
    .sort((a, b) => (a.scheduledAt! > b.scheduledAt! ? 1 : -1))
    .slice(0, 8);

  const accounts = await listConnectedAccounts(userId);

  const activityRows = await queryRows(
    `SELECT d.id, d.post_id, d.account_id, d.status, d.remote_post_id,
            d.error_message, d.created_at, d.updated_at
     FROM rs_deliveries d
     INNER JOIN rs_posts p ON p.id = d.post_id
     WHERE p.user_id = ?
     ORDER BY d.created_at DESC
     LIMIT 10`,
    [userId]
  );

  return {
    statistics: {
      totalPosts: Number(s?.totalPosts || 0),
      published: Number(s?.published || 0),
      scheduled: Number(s?.scheduled || 0),
      failed: Number(s?.failed || 0),
    },
    recentPosts,
    upcomingPosts,
    accounts,
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      accountId: row.account_id,
      status: row.status,
      remotePostId: row.remote_post_id,
      errorMessage: row.error_message,
      createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
      updatedAt: utcToIso(row.updated_at) ?? new Date().toISOString(),
    })),
  };
}

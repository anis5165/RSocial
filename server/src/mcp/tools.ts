import { z } from 'zod';
import {
  actionCancelScheduledPost,
  actionCreatePost,
  actionGetPostStatus,
  actionListConnectedAccounts,
  actionListScheduledPosts,
  actionPublishPost,
  actionRetryPost,
  actionSchedulePost,
  actionUploadMedia,
} from '../integrations/shared/publishingActions';
import { isAppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { McpServer } from './sdk';

function textResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
    isError,
  };
}

function mcpError(err: unknown) {
  if (isAppError(err)) {
    return textResult(
      {
        success: false,
        error: { code: err.code, message: err.message },
      },
      true
    );
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return textResult(
    {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    },
    true
  );
}

export function createRoutismMcpServer(userId: string, requestId?: string) {
  const server = new McpServer({
    name: 'routism-social',
    version: '1.0.0',
  });

  async function runTool(toolName: string, fn: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const data = await fn();
      logger.info('mcp_tool_ok', {
        tool: toolName,
        userId,
        requestId,
        durationMs: Date.now() - started,
      });
      return textResult({ success: true, data });
    } catch (err) {
      logger.warn('mcp_tool_error', {
        tool: toolName,
        userId,
        requestId,
        durationMs: Date.now() - started,
        code: isAppError(err) ? err.code : 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'unknown',
      });
      return mcpError(err);
    }
  }

  server.registerTool(
    'list_connected_accounts',
    {
      title: 'List connected accounts',
      description:
        'List social accounts connected to the authenticated Routism Social user. Returns platform, username, and connection status only — never access tokens. Use this before publishing or scheduling to confirm Instagram is connected. Do not invent or request a userId.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => runTool('list_connected_accounts', () => actionListConnectedAccounts(userId))
  );

  server.registerTool(
    'upload_image',
    {
      title: 'Upload image',
      description:
        'Upload a JPEG/JPG image for the authenticated Routism Social user to Cloudinary via the backend, then store media metadata in MySQL. Provide imageBase64 (raw base64 or a data URL). Returns mediaId and secureUrl for use with create_post. Only JPEG is accepted. Never send Cloudinary secrets.',
      inputSchema: {
        imageBase64: z
          .string()
          .min(1)
          .describe('JPEG image as base64 or data:image/jpeg;base64,...'),
        mimeType: z.string().optional().describe('MIME type, default image/jpeg'),
        filename: z.string().optional().describe('Optional filename ending in .jpg/.jpeg'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: { imageBase64: string; mimeType?: string; filename?: string }) =>
      runTool('upload_image', () => actionUploadMedia(userId, args))
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create draft post',
      description:
        'Create a draft Instagram post for the authenticated Routism user using a previously uploaded media asset. This does not publish the post. Returns postId and status=draft.',
      inputSchema: {
        caption: z.string().min(1).max(2200).describe('Instagram caption text'),
        mediaId: z.string().uuid().describe('Media ID returned by upload_image'),
        accountId: z.string().uuid().optional().describe('Optional connected Instagram account id'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: { caption: string; mediaId: string; accountId?: string }) =>
      runTool('create_post', () => actionCreatePost(userId, args))
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule post',
      description:
        'Schedule an existing Instagram draft for future publication. Routism will publish it automatically at the scheduled time. Requires a connected Instagram account. Only posts owned by the authenticated user can be scheduled.',
      inputSchema: {
        postId: z.string().uuid().describe('Post ID to schedule'),
        scheduledAt: z
          .string()
          .describe(
            'Local datetime in the given timezone, e.g. 2026-10-11T20:00:00 or 2026-10-11 20:00'
          ),
        timezone: z
          .string()
          .default('Asia/Kolkata')
          .describe('IANA timezone, default Asia/Kolkata'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: { postId: string; scheduledAt: string; timezone?: string }) =>
      runTool('schedule_post', () => actionSchedulePost(userId, args))
  );

  server.registerTool(
    'publish_post',
    {
      title: 'Publish post now',
      description:
        "Immediately publish an existing Instagram post. This creates an external side effect on Instagram. Use ONLY when the user explicitly wants the post published now. Calls the same backend publishPost service used by the website and scheduler. Never ask for Instagram tokens.",
      inputSchema: {
        postId: z.string().uuid().describe('Post ID to publish'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (args: { postId: string }) =>
      runTool('publish_post', () => actionPublishPost(userId, args))
  );

  server.registerTool(
    'get_post_status',
    {
      title: 'Get post status',
      description:
        'Return the current status of a Routism Social post owned by the authenticated user, including scheduled time and remote Instagram post id when available.',
      inputSchema: {
        postId: z.string().uuid().describe('Post ID to inspect'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: { postId: string }) =>
      runTool('get_post_status', () => actionGetPostStatus(userId, args.postId))
  );

  server.registerTool(
    'cancel_post',
    {
      title: 'Cancel scheduled post',
      description:
        'Cancel a future scheduled Instagram post and return it to draft status. This does not delete the media. Only allowed when status is scheduled.',
      inputSchema: {
        postId: z.string().uuid().describe('Scheduled post ID to cancel'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (args: { postId: string }) =>
      runTool('cancel_post', () => actionCancelScheduledPost(userId, args.postId))
  );

  server.registerTool(
    'list_scheduled_posts',
    {
      title: 'List scheduled posts',
      description:
        'List upcoming scheduled Instagram posts for the authenticated Routism user. Use before creating another scheduled post from a ChatGPT task.',
      inputSchema: {
        from: z.string().optional().describe('Optional ISO lower bound'),
        to: z.string().optional().describe('Optional ISO upper bound'),
        accountId: z.string().uuid().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: { from?: string; to?: string; accountId?: string }) =>
      runTool('list_scheduled_posts', () => actionListScheduledPosts(userId, args))
  );

  server.registerTool(
    'retry_post',
    {
      title: 'Retry failed post',
      description:
        'Retry publishing a failed or needs_review Instagram post using Routism publishPost(). Does not create a duplicate when already published.',
      inputSchema: {
        postId: z.string().uuid().describe('Failed post ID'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (args: { postId: string }) =>
      runTool('retry_post', () => actionRetryPost(userId, args))
  );

  return server;
}

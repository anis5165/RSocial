import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  listConnectedAccounts,
  uploadImage,
  createPost,
  schedulePost,
  publishPost,
  getPostStatus,
  cancelPost,
} from '../services';
import { AppError, isAppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { assertTimezone } from '../utils/time';
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

function parseScheduleInput(scheduledAt: string, timezone: string) {
  const tz = assertTimezone(timezone);
  let dt = DateTime.fromISO(scheduledAt, { zone: tz });
  if (!dt.isValid) {
    dt = DateTime.fromSQL(scheduledAt, { zone: tz });
  }
  if (!dt.isValid) {
    dt = DateTime.fromFormat(scheduledAt, 'yyyy-MM-dd HH:mm', { zone: tz });
  }
  if (!dt.isValid) {
    dt = DateTime.fromFormat(scheduledAt, 'yyyy-MM-dd HH:mm:ss', { zone: tz });
  }
  if (!dt.isValid) {
    throw new AppError(
      'SCHEDULE_INVALID',
      'Invalid scheduledAt. Use ISO local datetime like 2026-10-11T20:00:00 in the given timezone.',
      400
    );
  }
  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm:ss'),
    timezone: tz,
  };
}

function toMulterFile(buffer: Buffer, mimeType: string, filename: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype: mimeType,
    size: buffer.length,
    buffer,
    stream: undefined as unknown as Express.Multer.File['stream'],
    destination: '',
    filename,
    path: '',
  };
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
    async () =>
      runTool('list_connected_accounts', async () => {
        const accounts = await listConnectedAccounts(userId);
        return accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username.startsWith('@') ? a.username : `@${a.username}`,
          status: a.status,
        }));
      })
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
    async (args: {
      imageBase64: string;
      mimeType?: string;
      filename?: string;
    }) =>
      runTool('upload_image', async () => {
        let b64 = args.imageBase64.trim();
        let mime = (args.mimeType || 'image/jpeg').toLowerCase();
        if (b64.startsWith('data:')) {
          const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
          if (!match) throw new AppError('INVALID_MEDIA', 'Invalid data URL.', 400);
          mime = match[1].toLowerCase();
          b64 = match[2];
        }
        const buffer = Buffer.from(b64, 'base64');
        if (!buffer.length) throw new AppError('INVALID_MEDIA', 'Empty image payload.', 400);
        const filename = args.filename || 'upload.jpg';
        const media = await uploadImage(userId, toMulterFile(buffer, mime, filename));
        return {
          mediaId: media.id,
          secureUrl: media.secureUrl,
          mimeType: media.mimeType,
          width: media.width,
          height: media.height,
        };
      })
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create draft post',
      description:
        'Create a Routism Social draft post for the authenticated user using an existing mediaId and caption. Use this when the user wants to prepare content without publishing yet (e.g. "prepare this post"). Does not publish to Instagram. Returns postId and status=draft.',
      inputSchema: {
        caption: z.string().min(1).max(2200).describe('Instagram caption text'),
        mediaId: z.string().uuid().describe('Media ID returned by upload_image'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: { caption: string; mediaId: string }) =>
      runTool('create_post', async () => {
        const post = await createPost(userId, {
          caption: args.caption,
          mediaId: args.mediaId,
        });
        return {
          postId: post.id,
          status: post.status,
          caption: post.caption,
          mediaId: post.mediaId,
        };
      })
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule post',
      description:
        'Schedule an existing Routism Social post for a future date/time. The server converts the local scheduledAt in the given timezone to UTC and stores both. Use when the user wants future publishing (e.g. "tomorrow at 8 PM India time"). Requires a connected Instagram account. Only posts owned by the authenticated user can be scheduled.',
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
      runTool('schedule_post', async () => {
        const parsed = parseScheduleInput(args.scheduledAt, args.timezone || 'Asia/Kolkata');
        const post = await schedulePost(userId, {
          postId: args.postId,
          ...parsed,
        });
        return {
          postId: post.id,
          status: post.status,
          scheduledAt: post.scheduledAt,
          timezone: post.timezone,
        };
      })
  );

  server.registerTool(
    'publish_post',
    {
      title: 'Publish post now',
      description:
        "Publish an existing Routism Social draft immediately to the authenticated user's connected Instagram account. Use this ONLY when the user explicitly wants the post published now. Do not publish for ambiguous requests like \"prepare this\". Calls the same backend publishPost service used by the website and scheduler. Never ask for Instagram tokens.",
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
      runTool('publish_post', async () => {
        const post = await publishPost(args.postId, userId);
        const delivery = post.deliveries?.find((d) => d.status === 'published');
        return {
          postId: post.id,
          status: post.status,
          remotePostId: delivery?.remotePostId || null,
          errorMessage: post.errorMessage,
        };
      })
  );

  server.registerTool(
    'get_post_status',
    {
      title: 'Get post status',
      description:
        'Return the current status of a Routism Social post owned by the authenticated user, including scheduled time, platform, and remote Instagram post id when available. Use after create/schedule/publish to confirm state. Returns POST_NOT_FOUND for posts that do not belong to this user.',
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
      runTool('get_post_status', async () => {
        const post = await getPostStatus(args.postId, userId);
        const delivery = post.deliveries?.find((d) => d.remotePostId) || post.deliveries?.[0];
        return {
          postId: post.id,
          status: post.status,
          scheduledAt: post.scheduledAt,
          timezone: post.timezone,
          platform: 'instagram',
          remotePostId: delivery?.remotePostId || null,
          errorMessage: post.errorMessage,
        };
      })
  );

  server.registerTool(
    'cancel_post',
    {
      title: 'Cancel scheduled post',
      description:
        'Cancel a scheduled Routism Social post owned by the authenticated user, returning it to draft. Only allowed when status is scheduled. Do not use for published posts. Confirm with the user before cancelling when the instruction is ambiguous.',
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
      runTool('cancel_post', async () => {
        const post = await cancelPost(args.postId, userId);
        return {
          postId: post.id,
          status: post.status,
        };
      })
  );

  return server;
}

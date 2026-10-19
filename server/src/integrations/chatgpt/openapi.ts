import { env } from '../../config/env';

/** OpenAPI 3.1 document for ChatGPT Custom GPT Actions / Plugin wiring */
export function openApiDocument() {
  const base = env.API_BASE_URL.replace(/\/$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Routism Social ChatGPT Actions',
      version: '1.0.0',
      description:
        'Authenticated Routism Social actions for ChatGPT Scheduled Tasks and Custom GPT Actions. ' +
        'Creates drafts, schedules, and publishes Instagram posts through Routism. ' +
        'Instagram credentials never leave the Routism backend. Future publishes use the Routism scheduler.',
    },
    servers: [{ url: `${base}/integrations/chatgpt/v1` }],
    paths: {
      '/accounts': {
        get: {
          operationId: 'list_connected_accounts',
          summary: 'List connected Instagram accounts',
          description:
            'List social accounts connected to the authenticated Routism user. Returns platform, username, and status only — never access tokens.',
          responses: {
            '200': { description: 'Account list' },
          },
        },
      },
      '/media/upload': {
        post: {
          operationId: 'upload_media',
          summary: 'Upload JPEG media',
          description:
            'Upload a JPEG/JPG image for the authenticated Routism user to Cloudinary via Routism, then store media metadata. Provide imageBase64. Returns mediaId for create_post. Does not publish.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['imageBase64'],
                  properties: {
                    imageBase64: { type: 'string' },
                    mimeType: { type: 'string' },
                    filename: { type: 'string' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Uploaded media' } },
        },
      },
      '/posts': {
        post: {
          operationId: 'create_post',
          summary: 'Create draft Instagram post',
          description:
            'Create a draft Instagram post for the authenticated Routism user using a previously uploaded media asset. This does not publish the post.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['caption', 'mediaId'],
                  properties: {
                    caption: { type: 'string', maxLength: 2200 },
                    mediaId: { type: 'string', format: 'uuid' },
                    accountId: { type: 'string', format: 'uuid' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Draft created' } },
        },
      },
      '/posts/schedule': {
        post: {
          operationId: 'schedule_post',
          summary: 'Schedule draft for future publish',
          description:
            'Schedule an existing Instagram draft for future publication. Routism will publish it automatically at the scheduled time via its backend scheduler. ChatGPT does not need to stay online.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['postId', 'scheduledAt'],
                  properties: {
                    postId: { type: 'string', format: 'uuid' },
                    scheduledAt: {
                      type: 'string',
                      description: 'Local datetime in timezone, e.g. 2026-10-20T19:00:00',
                    },
                    timezone: {
                      type: 'string',
                      description: 'IANA timezone; defaults to Routism user timezone',
                    },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Scheduled' } },
        },
      },
      '/posts/publish': {
        post: {
          operationId: 'publish_post',
          summary: 'Publish post now',
          description:
            'Immediately publish an existing Instagram post. This creates an external side effect on Instagram via Routism publishPost().',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['postId'],
                  properties: {
                    postId: { type: 'string', format: 'uuid' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Publish result' } },
        },
      },
      '/posts/cancel': {
        post: {
          operationId: 'cancel_scheduled_post',
          summary: 'Cancel scheduled post',
          description:
            'Cancel a future scheduled Instagram post and return it to draft status. This does not delete the media.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['postId'],
                  properties: { postId: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Cancelled' } },
        },
      },
      '/posts/status': {
        get: {
          operationId: 'get_post_status',
          summary: 'Get post status',
          description:
            'Return the current status of a Routism post owned by the authenticated user, including schedule and remote Instagram id when available.',
          parameters: [
            {
              name: 'postId',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: { '200': { description: 'Status' } },
        },
      },
      '/posts/scheduled': {
        get: {
          operationId: 'list_scheduled_posts',
          summary: 'List scheduled posts',
          description:
            'List upcoming scheduled Instagram posts for the authenticated Routism user. Use before creating another scheduled post.',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Scheduled posts' } },
        },
      },
      '/posts/retry': {
        post: {
          operationId: 'retry_post',
          summary: 'Retry failed post',
          description:
            'Retry publishing a failed or needs_review Instagram post using the same Routism publishPost() path. Does not create a duplicate when already published.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['postId'],
                  properties: {
                    postId: { type: 'string', format: 'uuid' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Retry result' } },
        },
      },
    },
    components: {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: `${base}/integrations/chatgpt/oauth/authorize`,
              tokenUrl: `${base}/integrations/chatgpt/oauth/token`,
              scopes: {
                'chatgpt:actions': 'Create, schedule, and publish Instagram posts via Routism',
              },
            },
          },
        },
      },
    },
    security: [{ oauth2: ['chatgpt:actions'] }],
  };
}

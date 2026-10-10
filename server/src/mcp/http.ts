import { Router, Request, Response, Application } from 'express';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { RoutismOAuthProvider } from './oauth/provider';
import { createRoutismMcpServer } from './tools';
import loginRoutes from './oauth/loginRoutes';
import {
  StreamableHTTPServerTransport,
  getOAuthProtectedResourceMetadataUrl,
  isInitializeRequest,
  mcpAuthRouter,
  requireBearerAuth,
} from './sdk';

const provider = new RoutismOAuthProvider();

const sessions = new Map<
  string,
  { transport: any; server: any; userId: string }
>();

export function getMcpIssuerUrl(): URL {
  return new URL(env.API_BASE_URL);
}

export function getMcpResourceUrl(): URL {
  return new URL('/mcp', env.API_BASE_URL);
}

export function mountMcpAuth(app: Application) {
  const issuerUrl = getMcpIssuerUrl();
  const resourceServerUrl = getMcpResourceUrl();

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      baseUrl: issuerUrl,
      resourceServerUrl,
      scopesSupported: ['mcp:tools'],
      resourceName: 'Routism Social MCP',
      serviceDocumentationUrl: new URL('/api/health', env.API_BASE_URL),
    })
  );

  app.use('/mcp/oauth', loginRoutes);
}

function getUserId(req: Request): string {
  const userId = (req as any).auth?.extra?.userId;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('NOT_AUTHORIZED');
  }
  return userId;
}

async function handleMcp(req: Request, res: Response) {
  const userId = getUserId(req);
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    if (sessionId && sessions.has(sessionId)) {
      const existing = sessions.get(sessionId)!;
      if (existing.userId !== userId) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session belongs to another user' },
          id: null,
        });
        return;
      }
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const server = createRoutismMcpServer(userId, req.requestId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, { transport, server, userId });
          logger.info('mcp_session_initialized', { sessionId: sid, userId });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST') {
      const server = createRoutismMcpServer(userId, req.requestId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      await server.close().catch(() => undefined);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: invalid MCP session' },
      id: null,
    });
  } catch (err) {
    logger.error('mcp_http_error', {
      userId,
      message: err instanceof Error ? err.message : 'unknown',
      requestId: req.requestId,
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP error' },
        id: null,
      });
    }
  }
}

export function createMcpRouter(): Router {
  const router = Router();
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(getMcpResourceUrl());

  const auth = requireBearerAuth({
    verifier: provider,
    requiredScopes: ['mcp:tools'],
    resourceMetadataUrl,
  });

  router.post('/', auth, (req, res) => {
    void handleMcp(req, res);
  });
  router.get('/', auth, (req, res) => {
    void handleMcp(req, res);
  });
  router.delete('/', auth, (req, res) => {
    void handleMcp(req, res);
  });

  return router;
}

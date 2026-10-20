import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, isProd } from './config/env';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/logging';
import { errorHandler } from './middleware/errorHandler';
import { csrfProtection } from './middleware/csrf';
import { startScheduler } from './services/scheduler/schedulerService';
import { logger } from './utils/logger';
import { pool } from './db/pool';
import { formatMysqlError, mysqlPoolMeta } from './db/config';
import { createMcpRouter, mountMcpAuth } from './mcp/http';
import { mountChatgptIntegration } from './integrations/chatgpt';

import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import accountsRoutes from './routes/accountsRoutes';
import mediaRoutes from './routes/mediaRoutes';
import postsRoutes from './routes/postsRoutes';
import settingsRoutes from './routes/settingsRoutes';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

const dashboardOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());

app.use(
  cors({
    origin(origin, cb) {
      // Non-browser / same-origin / MCP inspector
      if (!origin) return cb(null, true);
      if (dashboardOrigins.includes(origin)) return cb(null, true);
      // Remote MCP clients (ChatGPT, Inspector) use Bearer tokens, not cookies
      if (env.NODE_ENV !== 'production') return cb(null, true);
      // Production: allow configured extras
      const mcpOrigins = (process.env.MCP_CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (mcpOrigins.includes('*') || mcpOrigins.includes(origin)) return cb(null, true);
      // ChatGPT / OpenAI connector origins commonly used
      if (
        origin.endsWith('.openai.com') ||
        origin === 'https://chatgpt.com' ||
        origin.endsWith('.chatgpt.com')
      ) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['Mcp-Session-Id'],
  })
);

app.use(express.json({ limit: '15mb' })); // MCP image base64 payloads
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.SESSION_SECRET));
app.use(requestId);
app.use(requestLogger);

// MCP OAuth AS metadata + /authorize /token /register /revoke (mounted at root)
mountMcpAuth(app);

// ChatGPT Custom GPT Actions / Plugin OAuth + REST actions (shares publishPost services)
mountChatgptIntegration(app);

app.use(csrfProtection);

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      time: new Date().toISOString(),
      mcp: '/mcp',
      chatgptActions: '/integrations/chatgpt/v1',
      chatgptOpenApi: '/integrations/chatgpt/openapi.json',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/settings', settingsRoutes);

// Authenticated Streamable HTTP MCP endpoint
app.use('/mcp', createMcpRouter());

app.use(errorHandler);

async function boot() {
  try {
    await pool.query('SELECT 1');
    logger.info('database_connected');
  } catch (err) {
    logger.error('database_connection_failed', {
      ...mysqlPoolMeta(),
      ...formatMysqlError(err),
    });
    process.exit(1);
  }

  startScheduler();

  app.listen(env.PORT, () => {
    logger.info('server_listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      prod: isProd,
      mcp: `${env.API_BASE_URL}/mcp`,
    });
  });
}

boot();

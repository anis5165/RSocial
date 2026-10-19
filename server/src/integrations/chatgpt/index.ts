import { Application } from 'express';
import oauthRoutes from './auth/oauthRoutes';
import actionsRoutes from './routes';

/** Mount ChatGPT Plugin/App OAuth + Actions REST API (keeps MCP intact). */
export function mountChatgptIntegration(app: Application) {
  app.use('/integrations/chatgpt/oauth', oauthRoutes);
  app.use('/integrations/chatgpt', actionsRoutes);
}

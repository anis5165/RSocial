/**
 * Load MCP SDK at runtime via require (tsx supports ESM interop).
 * Avoid static imports so `tsc` does not pull the SDK type graph.
 */
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */

function load(mod: string): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(mod);
}

const mcpServerMod = load('@modelcontextprotocol/sdk/server/mcp.js');
const streamableMod = load('@modelcontextprotocol/sdk/server/streamableHttp.js');
const bearerMod = load('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const routerMod = load('@modelcontextprotocol/sdk/server/auth/router.js');
const typesMod = load('@modelcontextprotocol/sdk/types.js');
const errorsMod = load('@modelcontextprotocol/sdk/server/auth/errors.js');

export const McpServer = mcpServerMod.McpServer;
export const StreamableHTTPServerTransport = streamableMod.StreamableHTTPServerTransport;
export const requireBearerAuth = bearerMod.requireBearerAuth;
export const mcpAuthRouter = routerMod.mcpAuthRouter;
export const getOAuthProtectedResourceMetadataUrl =
  routerMod.getOAuthProtectedResourceMetadataUrl;
export const isInitializeRequest = typesMod.isInitializeRequest;
export const InvalidRequestError = errorsMod.InvalidRequestError;

export type OAuthClientInformationFull = any;
export type AuthorizationParams = any;
export type OAuthTokens = any;
export type AuthInfo = any;
export type OAuthServerProvider = any;
export type OAuthRegisteredClientsStore = any;

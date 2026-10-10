/**
 * Ambient shims so tsc does not load the full MCP SDK type graph.
 * Runtime resolution still uses the real package via tsx/node.
 */
declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export const McpServer: any;
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  export const StreamableHTTPServerTransport: any;
}

declare module '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js' {
  export function requireBearerAuth(options: any): any;
}

declare module '@modelcontextprotocol/sdk/server/auth/router.js' {
  export function mcpAuthRouter(options: any): any;
  export function getOAuthProtectedResourceMetadataUrl(url: URL): string;
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export function isInitializeRequest(value: unknown): boolean;
}

declare module '@modelcontextprotocol/sdk/server/auth/errors.js' {
  export class InvalidRequestError extends Error {
    constructor(message: string);
  }
}

declare module '@modelcontextprotocol/sdk/client/index.js' {
  export class Client {
    constructor(info: any, options?: any);
    connect(transport: any): Promise<void>;
    listTools(): Promise<any>;
    callTool(params: any): Promise<any>;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/client/streamableHttp.js' {
  export class StreamableHTTPClientTransport {
    constructor(url: URL, opts?: any);
  }
}

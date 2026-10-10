export const McpServer: any = undefined;
export const StreamableHTTPServerTransport: any = undefined;
export function requireBearerAuth(_options: any): any {
  return undefined;
}
export function mcpAuthRouter(_options: any): any {
  return undefined;
}
export function getOAuthProtectedResourceMetadataUrl(_url: URL): string {
  return '';
}
export function isInitializeRequest(_value: unknown): boolean {
  return false;
}
export class InvalidRequestError extends Error {}
export class Client {
  constructor(_info: any, _options?: any) {}
  connect(_transport: any): Promise<void> {
    return Promise.resolve();
  }
  listTools(): Promise<any> {
    return Promise.resolve({ tools: [] });
  }
  callTool(_params: any): Promise<any> {
    return Promise.resolve({});
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}
export class StreamableHTTPClientTransport {
  constructor(_url: URL, _opts?: any) {}
}

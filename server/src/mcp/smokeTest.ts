/**
 * Local MCP tool smoke test (no ChatGPT required).
 *
 *   npm run mcp:token -w server
 *   set MCP_TOKEN=...
 *   npm run mcp:smoke -w server
 */
async function main() {
  const base = process.env.API_BASE_URL || 'http://localhost:4000';
  const token = process.env.MCP_TOKEN;
  if (!token) {
    throw new Error('Set MCP_TOKEN from `npm run mcp:token`');
  }

  // Dynamic import keeps this script out of the main tsc graph issues
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  const url = new URL('/mcp', base);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const client = new Client({ name: 'routism-smoke', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(
    'tools:',
    tools.tools.map((t: { name: string }) => t.name)
  );

  const accounts = await client.callTool({ name: 'list_connected_accounts', arguments: {} });
  console.log('list_connected_accounts:', JSON.stringify(accounts, null, 2));

  await client.close();
  console.log('MCP smoke test complete.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

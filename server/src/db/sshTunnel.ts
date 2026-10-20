import net from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function sshTunnelConfigured(): boolean {
  return Boolean(env.DATABASE_SSH_HOST && env.DATABASE_SSH_USER);
}

function sshConnectConfig(): ConnectConfig {
  const cfg: ConnectConfig = {
    host: env.DATABASE_SSH_HOST,
    port: env.DATABASE_SSH_PORT,
    username: env.DATABASE_SSH_USER,
    keepaliveInterval: 15_000,
    readyTimeout: 20_000,
  };
  if (env.DATABASE_SSH_PRIVATE_KEY) {
    cfg.privateKey = env.DATABASE_SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (env.DATABASE_SSH_PASSWORD) {
    cfg.password = env.DATABASE_SSH_PASSWORD;
  }
  return cfg;
}

function openSsh(): Promise<Client> {
  const client = new Client();
  return new Promise((resolve, reject) => {
    client
      .on('ready', () => resolve(client))
      .on('error', reject)
      .connect(sshConnectConfig());
  });
}

/**
 * Opens a local TCP port that forwards to MySQL on the SSH host (127.0.0.1:3306
 * from Hostinger's point of view). Render cannot reach Hostinger :3306 directly.
 */
export async function startSshTunnel(): Promise<number> {
  let client = await openSsh();
  logger.info('ssh_tunnel_connected', {
    sshHost: env.DATABASE_SSH_HOST,
    sshPort: env.DATABASE_SSH_PORT,
    sshUser: env.DATABASE_SSH_USER,
  });

  const destHost = env.DATABASE_SSH_DEST_HOST;
  const destPort = env.DATABASE_PORT;

  let reconnecting = false;
  const reconnect = async () => {
    if (reconnecting) return;
    reconnecting = true;
    try {
      try {
        client.end();
      } catch {
        /* ignore */
      }
      client = await openSsh();
      watchClose();
      logger.info('ssh_tunnel_reconnected', { sshHost: env.DATABASE_SSH_HOST });
    } finally {
      reconnecting = false;
    }
  };

  const watchClose = () => {
    client.once('close', () => {
      logger.warn('ssh_tunnel_closed', { sshHost: env.DATABASE_SSH_HOST });
      void reconnect().catch((err) => {
        logger.error('ssh_tunnel_reconnect_failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      });
    });
  };
  watchClose();

  const server = net.createServer((incoming) => {
    client.forwardOut('127.0.0.1', 0, destHost, destPort, (err, stream) => {
      if (err || !stream) {
        incoming.destroy();
        return;
      }
      incoming.pipe(stream).pipe(incoming);
      incoming.on('error', () => stream.destroy());
      stream.on('error', () => incoming.destroy());
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('ssh_tunnel_bind_failed');
  }

  logger.info('ssh_tunnel_listening', {
    localPort: address.port,
    destHost,
    destPort,
  });
  return address.port;
}

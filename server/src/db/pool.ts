import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ConnectionOptions } from 'mysql2';
import { env } from '../config/env';
import { mysqlConnectionOptions } from './config';

function makePool(overrides: ConnectionOptions = {}) {
  return mysql.createPool({
    ...mysqlConnectionOptions(overrides),
    database: env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  });
}

export let pool = makePool();

export function recreatePool(overrides: ConnectionOptions = {}): void {
  const previous = pool;
  pool = makePool(overrides);
  void previous.end().catch(() => undefined);
}

export type DbConn = mysql.Pool | mysql.PoolConnection;

type SqlParam = string | number | boolean | Date | Buffer | null;

export async function queryRows<T extends RowDataPacket[] = RowDataPacket[]>(
  sql: string,
  params: SqlParam[] = [],
  conn: DbConn = pool
): Promise<T> {
  const [rows] = await conn.execute<T>(sql, params);
  return rows;
}

export async function queryExec(
  sql: string,
  params: SqlParam[] = [],
  conn: DbConn = pool
): Promise<ResultSetHeader> {
  const [result] = await conn.execute<ResultSetHeader>(sql, params);
  return result;
}

import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { mysqlConnectionOptions } from './config';

export const pool = mysql.createPool({
  ...mysqlConnectionOptions(),
  database: env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
});

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

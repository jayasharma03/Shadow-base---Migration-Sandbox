import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
export const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  sourcePort: Number(process.env.SOURCE_DB_PORT || 3307),
  shadowPort: Number(process.env.SHADOW_DB_PORT || 3308),
  user: process.env.DB_USER || 'shadowbase',
  password: process.env.DB_PASSWORD || 'shadowbase123',
  sourceDb: process.env.SOURCE_DB || 'shadowbase_source',
  shadowDb: process.env.SHADOW_DB || 'shadowbase_shadow',
  connectUrl: process.env.KAFKA_CONNECT_URL || 'http://localhost:8083'
};
export function quoteId(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) throw new Error('Invalid database identifier.');
  return `\`${value}\``;
}
export const sourcePool = mysql.createPool({host:config.host,port:config.sourcePort,user:config.user,password:config.password,waitForConnections:true,connectionLimit:5,multipleStatements:false});
export const shadowPool = mysql.createPool({host:config.host,port:config.shadowPort,user:config.user,password:config.password,waitForConnections:true,connectionLimit:5,multipleStatements:false});
export async function dbQuery(pool, sql, params=[]) { return pool.query(sql,params); }

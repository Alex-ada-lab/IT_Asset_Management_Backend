import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Shared PostgreSQL connection pool.
 *
 * Configuration is driven entirely by environment variables so that the same
 * module works in development, test, and production without code changes.
 *
 * Required env vars:
 *   DB_HOST     – database host          (default: localhost)
 *   DB_PORT     – database port          (default: 5432)
 *   DB_NAME     – database name          (required)
 *   DB_USER     – database user          (required)
 *   DB_PASSWORD – database password      (required)
 *
 * Optional env vars:
 *   DB_SSL      – set to "true" to enable SSL (default: false)
 *   DB_POOL_MAX – maximum pool size       (default: 10)
 */
const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Surface connection errors without crashing the process
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err);
});

export default pool;

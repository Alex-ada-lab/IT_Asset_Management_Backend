import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// With ts-node-dev, __dirname is backend/src/db (source).
// When compiled, __dirname is backend/dist/db.
// Walk up to find .env in backend/ then the repo root.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });    // backend/.env  (ts-node: src/db → backend)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') }); // repo root .env (ts-node: src/db → root)

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
 *   DB_SSL      – set to "true" to force SSL; SSL is also auto-enabled for Neon hosts
 *   DB_POOL_MAX – maximum pool size       (default: 10)
 */
const dbHost = process.env.DB_HOST ?? 'localhost';

// Neon and most cloud Postgres providers require SSL.
// Enable SSL if DB_SSL=true OR if the host looks like a Neon host.
const sslRequired =
  process.env.DB_SSL === 'true' || dbHost.includes('neon.tech');

const pool = new Pool({
  host:     dbHost,
  port:     parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  ssl:      sslRequired ? { rejectUnauthorized: false } : false,
});

// Surface connection errors without crashing the process
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err);
});

export default pool;

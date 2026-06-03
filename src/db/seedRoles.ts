import pool from './pool';
import { ROLE_PERMISSIONS } from '../config/permissions';

/**
 * Upserts the three default roles (Administrator, IT Staff, Read-Only User)
 * into the `roles` table with their associated permissions.
 *
 * Safe to call on every startup — uses INSERT … ON CONFLICT DO UPDATE.
 */
export async function seedRoles(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      await client.query(
        `INSERT INTO roles (name, permissions)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (name) DO UPDATE
           SET permissions = EXCLUDED.permissions,
               updated_at  = NOW()`,
        [name, JSON.stringify(permissions)]
      );
    }

    await client.query('COMMIT');
    console.log('[db] Roles seeded successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db] Failed to seed roles:', err);
    throw err;
  } finally {
    client.release();
  }
}

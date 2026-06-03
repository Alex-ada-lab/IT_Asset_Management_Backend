import pool from '../db/pool';

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  dedupKey?: string;
}

/**
 * Creates a notification for a user.
 * Uses ON CONFLICT (dedup_key) DO NOTHING for deduplication.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { userId, type, title, message, entityType, entityId, dedupKey } = params;

  await pool.query(
    `INSERT INTO notifications
       (user_id, type, title, message, entity_type, entity_id, dedup_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedup_key) DO NOTHING`,
    [
      userId,
      type,
      title,
      message,
      entityType ?? null,
      entityId ?? null,
      dedupKey ?? null,
    ]
  );
}

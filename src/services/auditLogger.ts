import { PoolClient } from 'pg';

interface AuditLogParams {
  entityType: string;
  entityId?: string;
  action: string;
  actingUserId?: string;
  ipAddress?: string;
  changedFields?: Record<string, unknown>;
}

/**
 * Logs an audit entry using the provided DB client so it participates
 * in the caller's transaction.
 */
export async function logAudit(client: PoolClient, params: AuditLogParams): Promise<void> {
  const { entityType, entityId, action, actingUserId, ipAddress, changedFields } = params;
  await client.query(
    `INSERT INTO audit_logs
       (entity_type, entity_id, action, acting_user_id, ip_address, changed_fields)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      entityType,
      entityId ?? null,
      action,
      actingUserId ?? null,
      ipAddress ?? null,
      changedFields ? JSON.stringify(changedFields) : null,
    ]
  );
}

import cron from 'node-cron';
import pool from '../db/pool';
import { createNotification } from '../services/notificationService';

/**
 * Starts all scheduled cron jobs for the ITAM system.
 */
export function startScheduledJobs(): void {
  // Daily at 08:00 — check for expiring warranties, licenses, and maintenance
  cron.schedule('0 8 * * *', async () => {
    try {
      await runDailyNotifications();
    } catch (err) {
      console.error('[scheduledJobs] Error running daily notifications:', err);
    }
  });

  console.log('[scheduledJobs] Scheduled jobs started.');
}

async function runDailyNotifications(): Promise<void> {
  // Fetch all Administrator users
  const adminResult = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'Administrator' AND u.is_active = TRUE`
  );
  const adminIds = adminResult.rows.map((r) => r.id);

  if (adminIds.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);

  // 1. Warranty expiring within 30 days
  const warranty30 = await pool.query<{ id: string; name: string; asset_id: string }>(
    `SELECT id, name, asset_id FROM assets
      WHERE is_archived = FALSE
        AND warranty_expiry_date >= CURRENT_DATE
        AND warranty_expiry_date <= CURRENT_DATE + INTERVAL '30 days'`
  );
  for (const asset of warranty30.rows) {
    for (const adminId of adminIds) {
      await createNotification({
        userId: adminId,
        type: 'warranty_expiry_30',
        title: 'Warranty Expiring Soon (30 days)',
        message: `Asset "${asset.name}" (${asset.asset_id}) warranty expires within 30 days.`,
        entityType: 'asset',
        entityId: asset.id,
        dedupKey: `warranty_30_${asset.id}_${today}`,
      });
    }
  }

  // 2. Warranty expiring within 7 days
  const warranty7 = await pool.query<{ id: string; name: string; asset_id: string }>(
    `SELECT id, name, asset_id FROM assets
      WHERE is_archived = FALSE
        AND warranty_expiry_date >= CURRENT_DATE
        AND warranty_expiry_date <= CURRENT_DATE + INTERVAL '7 days'`
  );
  for (const asset of warranty7.rows) {
    for (const adminId of adminIds) {
      await createNotification({
        userId: adminId,
        type: 'warranty_expiry_7',
        title: 'Warranty Expiring Soon (7 days)',
        message: `Asset "${asset.name}" (${asset.asset_id}) warranty expires within 7 days.`,
        entityType: 'asset',
        entityId: asset.id,
        dedupKey: `warranty_7_${asset.id}_${today}`,
      });
    }
  }

  // 3. Warranty already expired
  const warrantyExpired = await pool.query<{ id: string; name: string; asset_id: string }>(
    `SELECT id, name, asset_id FROM assets
      WHERE is_archived = FALSE
        AND warranty_expiry_date < CURRENT_DATE`
  );
  for (const asset of warrantyExpired.rows) {
    for (const adminId of adminIds) {
      await createNotification({
        userId: adminId,
        type: 'warranty_expired',
        title: 'Warranty Expired',
        message: `Asset "${asset.name}" (${asset.asset_id}) warranty has expired.`,
        entityType: 'asset',
        entityId: asset.id,
        dedupKey: `warranty_expired_${asset.id}_${today}`,
      });
    }
  }

  // 4. Software licenses expiring within 30 days
  const licenses30 = await pool.query<{ id: string; software_name: string }>(
    `SELECT id, software_name FROM software_licenses
      WHERE is_active = TRUE
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'`
  );
  for (const license of licenses30.rows) {
    for (const adminId of adminIds) {
      await createNotification({
        userId: adminId,
        type: 'license_expiry',
        title: 'License Expiring Soon',
        message: `Software license for "${license.software_name}" expires within 30 days.`,
        entityType: 'software_license',
        entityId: license.id,
        dedupKey: `license_30_${license.id}_${today}`,
      });
    }
  }

  // 5. Maintenance records scheduled within 3 days
  const maintenance3 = await pool.query<{ id: string; asset_id: string }>(
    `SELECT mr.id, a.name AS asset_name, mr.asset_id
       FROM maintenance_records mr
       JOIN assets a ON a.id = mr.asset_id
      WHERE mr.status != 'Completed'
        AND mr.scheduled_at >= NOW()
        AND mr.scheduled_at <= NOW() + INTERVAL '3 days'`
  );
  for (const record of maintenance3.rows) {
    for (const adminId of adminIds) {
      await createNotification({
        userId: adminId,
        type: 'maintenance_reminder',
        title: 'Maintenance Reminder',
        message: `Maintenance record is scheduled within the next 3 days.`,
        entityType: 'maintenance_record',
        entityId: record.id,
        dedupKey: `maintenance_3_${record.id}_${today}`,
      });
    }
  }
}

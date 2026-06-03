import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/reports/dashboard
// ---------------------------------------------------------------------------
router.get(
  '/dashboard',
  authenticate,
  authorize('reports:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [
        totalAssetsResult,
        byStatusResult,
        byDeptResult,
        warrantyResult,
        maintenanceCostResult,
        licensesResult,
      ] = await Promise.all([
        // Total non-archived assets
        pool.query(`SELECT COUNT(*) AS count FROM assets WHERE is_archived = FALSE`),

        // By status
        pool.query(
          `SELECT status, COUNT(*) AS count
             FROM assets
            WHERE is_archived = FALSE
            GROUP BY status`
        ),

        // By department (via active assignments)
        pool.query(
          `SELECT d.name AS department_name, COUNT(*) AS count
             FROM asset_assignments aa
             JOIN departments d ON d.id = aa.department_id
            WHERE aa.returned_at IS NULL
            GROUP BY d.name`
        ),

        // Warranty expiring within 30 days
        pool.query(
          `SELECT COUNT(*) AS count
             FROM assets
            WHERE is_archived = FALSE
              AND warranty_expiry_date >= CURRENT_DATE
              AND warranty_expiry_date <= CURRENT_DATE + INTERVAL '30 days'`
        ),

        // Maintenance cost current month
        pool.query(
          `SELECT COALESCE(SUM(actual_cost), 0) AS total
             FROM maintenance_records
            WHERE DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', CURRENT_DATE)`
        ),

        // Licenses expiring within 30 days
        pool.query(
          `SELECT COUNT(*) AS count
             FROM software_licenses
            WHERE is_active = TRUE
              AND expiry_date >= CURRENT_DATE
              AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'`
        ),
      ]);

      res.json({
        totalAssets: parseInt(totalAssetsResult.rows[0].count, 10),
        byStatus: byStatusResult.rows.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
        byDepartment: byDeptResult.rows.map((r) => ({
          departmentName: r.department_name,
          count: parseInt(r.count, 10),
        })),
        warrantyExpiringSoon: parseInt(warrantyResult.rows[0].count, 10),
        maintenanceCostCurrentMonth: parseFloat(maintenanceCostResult.rows[0].total),
        licensesExpiringSoon: parseInt(licensesResult.rows[0].count, 10),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/inventory
// ---------------------------------------------------------------------------
router.get(
  '/inventory',
  authenticate,
  authorize('reports:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { format } = req.query as { format?: string };

      const result = await pool.query(
        `SELECT
           a.id, a.asset_id, a.name, a.status, a.asset_type,
           e.full_name AS assigned_employee,
           d.name AS department_name,
           aa.location
         FROM assets a
         LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
         LEFT JOIN employees e ON e.id = aa.employee_id
         LEFT JOIN departments d ON d.id = aa.department_id
         WHERE a.is_archived = FALSE
         ORDER BY a.created_at DESC`
      );

      if (format === 'csv') {
        const headers = ['id', 'asset_id', 'name', 'status', 'asset_type', 'assigned_employee', 'department_name', 'location'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
        res.write(headers.join(',') + '\n');
        for (const row of result.rows) {
          res.write(
            headers.map((h) => csvEscape(row[h])).join(',') + '\n'
          );
        }
        res.end();
        return;
      }

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/maintenance
// ---------------------------------------------------------------------------
router.get(
  '/maintenance',
  authenticate,
  authorize('reports:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to, format } = req.query as Record<string, string | undefined>;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (from) {
        conditions.push(`mr.created_at >= $${paramIdx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`mr.created_at <= $${paramIdx++}`);
        params.push(to);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT mr.id, mr.status, mr.issue_description, mr.requested_at, mr.scheduled_at,
                mr.completed_at, mr.estimated_cost, mr.actual_cost, mr.resolution_notes,
                a.name AS asset_name, a.asset_id AS asset_tag,
                v.name AS vendor_name
           FROM maintenance_records mr
           JOIN assets a ON a.id = mr.asset_id
           LEFT JOIN vendors v ON v.id = mr.vendor_id
           ${whereClause}
           ORDER BY mr.created_at DESC`,
        params
      );

      if (format === 'csv') {
        const headers = ['id', 'asset_name', 'asset_tag', 'status', 'vendor_name', 'estimated_cost', 'actual_cost', 'resolution_notes'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="maintenance.csv"');
        res.write(headers.join(',') + '\n');
        for (const row of result.rows) {
          res.write(headers.map((h) => csvEscape(row[h])).join(',') + '\n');
        }
        res.end();
        return;
      }

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/utilization
// ---------------------------------------------------------------------------
router.get(
  '/utilization',
  authenticate,
  authorize('reports:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as Record<string, string | undefined>;

      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to) : new Date();
      const totalMs = toDate.getTime() - fromDate.getTime();

      // Get all non-archived assets
      const assetsResult = await pool.query(
        `SELECT id, asset_id, name, status FROM assets WHERE is_archived = FALSE`
      );

      const utilization: Array<{
        id: string;
        asset_id: string;
        name: string;
        utilizationPercent: number;
      }> = [];

      for (const asset of assetsResult.rows) {
        // Sum time in 'Assigned' status within the date range
        const histResult = await pool.query(
          `SELECT changed_at, new_status, previous_status
             FROM asset_status_history
            WHERE asset_id = $1
              AND changed_at >= $2
              AND changed_at <= $3
            ORDER BY changed_at ASC`,
          [asset.id, fromDate.toISOString(), toDate.toISOString()]
        );

        let assignedMs = 0;
        let lastAssignedAt: Date | null = null;

        for (const entry of histResult.rows) {
          if (entry.new_status === 'Assigned') {
            lastAssignedAt = new Date(entry.changed_at);
          } else if (entry.previous_status === 'Assigned' && lastAssignedAt) {
            assignedMs += new Date(entry.changed_at).getTime() - lastAssignedAt.getTime();
            lastAssignedAt = null;
          }
        }

        // If still assigned at end of period
        if (lastAssignedAt) {
          assignedMs += toDate.getTime() - lastAssignedAt.getTime();
        }

        utilization.push({
          id: asset.id,
          asset_id: asset.asset_id,
          name: asset.name,
          utilizationPercent: totalMs > 0 ? Math.round((assignedMs / totalMs) * 100 * 10) / 10 : 0,
        });
      }

      res.json(utilization);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/disposal
// ---------------------------------------------------------------------------
router.get(
  '/disposal',
  authenticate,
  authorize('reports:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { format } = req.query as { format?: string };

      const result = await pool.query(
        `SELECT id, asset_id, name, status, updated_at AS disposal_date, notes
           FROM assets
          WHERE status IN ('Retired', 'Disposed')
          ORDER BY updated_at DESC`
      );

      if (format === 'csv') {
        const headers = ['id', 'asset_id', 'name', 'status', 'disposal_date', 'notes'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="disposal.csv"');
        res.write(headers.join(',') + '\n');
        for (const row of result.rows) {
          res.write(headers.map((h) => csvEscape(row[h])).join(',') + '\n');
        }
        res.end();
        return;
      }

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/procurement
// ---------------------------------------------------------------------------
router.get(
  '/procurement',
  authenticate,
  authorize('reports:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { vendorId, from, to, categoryId, format } = req.query as Record<string, string | undefined>;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (vendorId) {
        conditions.push(`po.vendor_id = $${paramIdx++}`);
        params.push(vendorId);
      }
      if (from) {
        conditions.push(`po.order_date >= $${paramIdx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`po.order_date <= $${paramIdx++}`);
        params.push(to);
      }
      // categoryId filter: purchase_orders don't have category, skip if not applicable
      if (categoryId) {
        // no-op for now; purchase_orders table has no category_id
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT po.*, v.name AS vendor_name
           FROM purchase_orders po
           LEFT JOIN vendors v ON v.id = po.vendor_id
           ${whereClause}
           ORDER BY po.order_date DESC`,
        params
      );

      if (format === 'csv') {
        const headers = ['id', 'vendor_name', 'item_type', 'item_description', 'quantity', 'unit_cost', 'total_cost', 'order_date', 'status', 'invoice_reference'];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="procurement.csv"');
        res.write(headers.join(',') + '\n');
        for (const row of result.rows) {
          res.write(headers.map((h) => csvEscape(row[h])).join(',') + '\n');
        }
        res.end();
        return;
      }

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

/** Escape a value for CSV output */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default router;

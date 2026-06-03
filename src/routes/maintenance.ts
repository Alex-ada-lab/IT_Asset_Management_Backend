import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/maintenance — Create a maintenance record
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('maintenance:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        assetId,
        issueDescription,
        requestedAt,
        estimatedCost,
        vendorId,
        vendorName,
        vendorContact,
        scheduledAt,
        recurrenceIntervalDays,
      } = req.body as {
        assetId?: string;
        issueDescription?: string;
        requestedAt?: string;
        estimatedCost?: number;
        vendorId?: string;
        vendorName?: string;
        vendorContact?: string;
        scheduledAt?: string;
        recurrenceIntervalDays?: number;
      };

      if (!assetId) throw new ValidationError('assetId is required');
      if (!issueDescription) throw new ValidationError('issueDescription is required');
      if (!requestedAt) throw new ValidationError('requestedAt is required');
      if (estimatedCost === undefined || estimatedCost === null) {
        throw new ValidationError('estimatedCost is required');
      }

      // Fetch asset
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      if (assetResult.rowCount === 0) throw new NotFoundError('Asset not found');
      const asset = assetResult.rows[0];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert maintenance record
        const insertResult = await client.query(
          `INSERT INTO maintenance_records
             (asset_id, issue_description, requested_at, estimated_cost,
              vendor_id, vendor_name, vendor_contact, scheduled_at,
              recurrence_interval_days, status, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Open',$10)
           RETURNING *`,
          [
            assetId,
            issueDescription,
            requestedAt,
            estimatedCost,
            vendorId ?? null,
            vendorName ?? null,
            vendorContact ?? null,
            scheduledAt ?? null,
            recurrenceIntervalDays ?? null,
            req.user!.userId,
          ]
        );
        const record = insertResult.rows[0];

        // Update asset status to 'Under Maintenance'
        await client.query(
          `UPDATE assets SET status = 'Under Maintenance', updated_at = NOW() WHERE id = $1`,
          [assetId]
        );

        // Insert asset_status_history
        await client.query(
          `INSERT INTO asset_status_history
             (asset_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, $2, 'Under Maintenance', $3, $4)`,
          [assetId, asset.status, req.user!.userId, `Maintenance created: ${issueDescription}`]
        );

        // Insert audit_log
        await client.query(
          `INSERT INTO audit_logs
             (entity_type, entity_id, action, acting_user_id, changed_fields)
           VALUES ('maintenance_record', $1, 'maintenance_created', $2, $3::jsonb)`,
          [record.id, req.user!.userId, JSON.stringify(record)]
        );

        await client.query('COMMIT');
        res.status(201).json(record);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/maintenance/:id/complete — Complete a maintenance record
// ---------------------------------------------------------------------------
router.put(
  '/:id/complete',
  authenticate,
  authorize('maintenance:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { completedAt, actualCost, resolutionNotes } = req.body as {
        completedAt?: string;
        actualCost?: number;
        resolutionNotes?: string;
      };

      // Fetch maintenance record
      const mrResult = await pool.query(
        'SELECT * FROM maintenance_records WHERE id = $1',
        [id]
      );
      if (mrResult.rowCount === 0) throw new NotFoundError('Maintenance record not found');
      const record = mrResult.rows[0];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update maintenance record
        const updatedResult = await client.query(
          `UPDATE maintenance_records
              SET completed_at = $1,
                  actual_cost = $2,
                  resolution_notes = $3,
                  status = 'Completed',
                  updated_at = NOW()
            WHERE id = $4
            RETURNING *`,
          [completedAt ?? new Date().toISOString(), actualCost ?? null, resolutionNotes ?? null, id]
        );
        const updated = updatedResult.rows[0];

        // Set asset status back to 'Available'
        await client.query(
          `UPDATE assets SET status = 'Available', updated_at = NOW() WHERE id = $1`,
          [record.asset_id]
        );

        // Insert asset_status_history
        await client.query(
          `INSERT INTO asset_status_history
             (asset_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, 'Under Maintenance', 'Available', $2, $3)`,
          [record.asset_id, req.user!.userId, resolutionNotes ?? 'Maintenance completed']
        );

        // Insert audit_log
        await client.query(
          `INSERT INTO audit_logs
             (entity_type, entity_id, action, acting_user_id, changed_fields)
           VALUES ('maintenance_record', $1, 'maintenance_completed', $2, $3::jsonb)`,
          [id, req.user!.userId, JSON.stringify(updated)]
        );

        await client.query('COMMIT');
        res.json(updated);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/maintenance — List maintenance records (paginated)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('maintenance:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { assetId, status, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (assetId) {
        conditions.push(`mr.asset_id = $${paramIdx++}`);
        params.push(assetId);
      }
      if (status) {
        conditions.push(`mr.status = $${paramIdx++}`);
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM maintenance_records mr ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT mr.*, a.name AS asset_name, a.asset_id AS asset_tag
           FROM maintenance_records mr
           JOIN assets a ON a.id = mr.asset_id
           ${whereClause}
           ORDER BY mr.created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limitNum, offset]
      );

      res.json({
        data: dataResult.rows,
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/maintenance/upcoming — Upcoming maintenance within 3 days
// ---------------------------------------------------------------------------
router.get(
  '/upcoming',
  authenticate,
  authorize('maintenance:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT mr.*, a.name AS asset_name, a.asset_id AS asset_tag
           FROM maintenance_records mr
           JOIN assets a ON a.id = mr.asset_id
          WHERE mr.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
            AND mr.status != 'Completed'
          ORDER BY mr.scheduled_at ASC`
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/maintenance/:id — Get single maintenance record
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  authorize('maintenance:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT mr.*, a.name AS asset_name, a.asset_id AS asset_tag
           FROM maintenance_records mr
           JOIN assets a ON a.id = mr.asset_id
          WHERE mr.id = $1`,
        [id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Maintenance record not found');
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

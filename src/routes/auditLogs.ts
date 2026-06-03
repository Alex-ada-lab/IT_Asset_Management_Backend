import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/audit-logs — List audit log entries (paginated)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        entityType,
        entityId,
        actingUserId,
        from,
        to,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (entityType) {
        conditions.push(`al.entity_type = $${paramIdx++}`);
        params.push(entityType);
      }
      if (entityId) {
        conditions.push(`al.entity_id = $${paramIdx++}`);
        params.push(entityId);
      }
      if (actingUserId) {
        conditions.push(`al.acting_user_id = $${paramIdx++}`);
        params.push(actingUserId);
      }
      if (from) {
        conditions.push(`al.timestamp >= $${paramIdx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`al.timestamp <= $${paramIdx++}`);
        params.push(to);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_logs al ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT al.*, u.email AS acting_user_email
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.acting_user_id
           ${whereClause}
           ORDER BY al.timestamp DESC
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

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/notifications — List notifications for the authenticated user
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('notifications:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { isRead, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [`n.user_id = $1`];
      const params: unknown[] = [req.user!.userId];
      let paramIdx = 2;

      if (isRead !== undefined) {
        conditions.push(`n.is_read = $${paramIdx++}`);
        params.push(isRead === 'true');
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM notifications n ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT * FROM notifications n
           ${whereClause}
           ORDER BY n.sent_at DESC
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
// PUT /api/notifications/:id/read — Mark a notification as read
// ---------------------------------------------------------------------------
router.put(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE notifications
            SET is_read = TRUE, updated_at = NOW()
          WHERE id = $1 AND user_id = $2
          RETURNING *`,
        [id, req.user!.userId]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Notification not found');
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/departments — Create a new department
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name } = req.body as { name?: string };

      if (!name) throw new ValidationError('name is required');

      // Check for duplicate name
      const dupCheck = await pool.query(
        'SELECT id FROM departments WHERE name = $1',
        [name]
      );
      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        throw new ConflictError(`Department with name '${name}' already exists`);
      }

      const result = await pool.query(
        `INSERT INTO departments (name) VALUES ($1) RETURNING *`,
        [name]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/departments — List departments
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('employees:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { isActive } = req.query as { isActive?: string };

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (isActive !== undefined) {
        conditions.push(`is_active = $${paramIdx}`);
        params.push(isActive === 'true');
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT * FROM departments ${whereClause} ORDER BY name ASC`,
        params
      );

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/departments/:id — Update department
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Department not found');
      }

      const current = existing.rows[0];
      const { name, isActive } = req.body as { name?: string; isActive?: boolean };

      // Check name uniqueness if changing
      if (name !== undefined && name !== current.name) {
        const dupCheck = await pool.query(
          'SELECT id FROM departments WHERE name = $1 AND id != $2',
          [name, id]
        );
        if (dupCheck.rowCount && dupCheck.rowCount > 0) {
          throw new ConflictError(`Department with name '${name}' already exists`);
        }
      }

      const updatedResult = await pool.query(
        `UPDATE departments SET
           name       = COALESCE($1, name),
           is_active  = COALESCE($2, is_active),
           updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [name ?? null, isActive ?? null, id]
      );

      res.json(updatedResult.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/departments/:id — Soft deactivate department
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Department not found');
      }

      const updatedResult = await pool.query(
        `UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      res.json(updatedResult.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

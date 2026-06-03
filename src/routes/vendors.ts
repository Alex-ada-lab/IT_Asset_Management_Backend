import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/vendors — Create a vendor
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('procurement:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, contactPerson, email, phone, address } = req.body as {
        name?: string;
        contactPerson?: string;
        email?: string;
        phone?: string;
        address?: string;
      };

      if (!name) throw new ValidationError('name is required');
      if (!contactPerson) throw new ValidationError('contactPerson is required');
      if (!email) throw new ValidationError('email is required');
      if (!phone) throw new ValidationError('phone is required');
      if (!address) throw new ValidationError('address is required');

      const result = await pool.query(
        `INSERT INTO vendors (name, contact_person, email, phone, address)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [name, contactPerson, email, phone, address]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/vendors — List vendors
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('procurement:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { isActive } = req.query as Record<string, string | undefined>;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (isActive !== undefined) {
        conditions.push(`is_active = $${paramIdx++}`);
        params.push(isActive === 'true');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT * FROM vendors ${whereClause} ORDER BY name ASC`,
        params
      );

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/vendors/:id — Update a vendor
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('procurement:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT id FROM vendors WHERE id = $1', [id]);
      if (existing.rowCount === 0) throw new NotFoundError('Vendor not found');

      const { name, contactPerson, email, phone, address, isActive } = req.body as {
        name?: string;
        contactPerson?: string;
        email?: string;
        phone?: string;
        address?: string;
        isActive?: boolean;
      };

      const result = await pool.query(
        `UPDATE vendors SET
           name           = COALESCE($1, name),
           contact_person = COALESCE($2, contact_person),
           email          = COALESCE($3, email),
           phone          = COALESCE($4, phone),
           address        = COALESCE($5, address),
           is_active      = COALESCE($6, is_active),
           updated_at     = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          name ?? null,
          contactPerson ?? null,
          email ?? null,
          phone ?? null,
          address ?? null,
          isActive !== undefined ? isActive : null,
          id,
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/vendors/:id — Soft deactivate a vendor
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('procurement:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT id FROM vendors WHERE id = $1', [id]);
      if (existing.rowCount === 0) throw new NotFoundError('Vendor not found');

      await pool.query(
        `UPDATE vendors SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      res.json({ message: 'Vendor deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

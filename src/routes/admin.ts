import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/users — List all users with role names
// ---------------------------------------------------------------------------
router.get(
  '/users',
  authenticate,
  authorize('admin:manage'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.is_active, u.created_at, u.last_login_at,
                r.id AS role_id, r.name AS role_name
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
           ORDER BY u.created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/admin/users/:userId/role
 *
 * Assigns a new role to a user. Requires `admin:manage` permission.
 * Writes an audit log entry recording the role change.
 */
router.put(
  '/users/:userId/role',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { roleId } = req.body as { roleId?: string };

      if (!roleId) {
        throw new ValidationError('roleId is required');
      }

      // Fetch current user
      const userResult = await pool.query<{ id: string; email: string; role_id: string | null }>(
        'SELECT id, email, role_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rowCount === 0) {
        throw new NotFoundError('User not found');
      }

      const user = userResult.rows[0];
      const previousRoleId = user.role_id;

      // Verify the target role exists
      const roleResult = await pool.query('SELECT id FROM roles WHERE id = $1', [roleId]);
      if (roleResult.rowCount === 0) {
        throw new NotFoundError('Role not found');
      }

      // Update user's role
      const updatedResult = await pool.query<{ id: string; email: string; role_id: string }>(
        `UPDATE users
            SET role_id    = $1,
                updated_at = NOW()
          WHERE id = $2
          RETURNING id, email, role_id`,
        [roleId, userId]
      );

      const updatedUser = updatedResult.rows[0];

      // Write audit log
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('user', $1, 'role_assigned', $2, $3::jsonb)`,
        [
          userId,
          req.user!.userId,
          JSON.stringify({
            previousRoleId,
            newRoleId: roleId,
            actingAdminId: req.user!.userId,
          }),
        ]
      );

      res.status(200).json({
        id: updatedUser.id,
        email: updatedUser.email,
        roleId: updatedUser.role_id,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/admin/categories — Create an asset category
// ---------------------------------------------------------------------------
router.post(
  '/categories',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, lowInventoryThreshold } = req.body as {
        name?: string;
        lowInventoryThreshold?: number;
      };

      if (!name) throw new ValidationError('name is required');

      const result = await pool.query(
        `INSERT INTO asset_categories (name, low_inventory_threshold)
         VALUES ($1, $2)
         RETURNING *`,
        [name, lowInventoryThreshold ?? 0]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/categories — List asset categories
// ---------------------------------------------------------------------------
router.get(
  '/categories',
  authenticate,
  authorize('admin:manage'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT * FROM asset_categories ORDER BY name ASC`
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/categories/:id — Update an asset category
// ---------------------------------------------------------------------------
router.put(
  '/categories/:id',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query(
        'SELECT id FROM asset_categories WHERE id = $1',
        [id]
      );
      if (existing.rowCount === 0) throw new NotFoundError('Category not found');

      const { name, lowInventoryThreshold, isActive } = req.body as {
        name?: string;
        lowInventoryThreshold?: number;
        isActive?: boolean;
      };

      const result = await pool.query(
        `UPDATE asset_categories SET
           name                   = COALESCE($1, name),
           low_inventory_threshold = COALESCE($2, low_inventory_threshold),
           is_active              = COALESCE($3, is_active),
           updated_at             = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          name ?? null,
          lowInventoryThreshold !== undefined ? lowInventoryThreshold : null,
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
// DELETE /api/admin/categories/:id — Soft deactivate a category
// ---------------------------------------------------------------------------
router.delete(
  '/categories/:id',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query(
        'SELECT id FROM asset_categories WHERE id = $1',
        [id]
      );
      if (existing.rowCount === 0) throw new NotFoundError('Category not found');

      await pool.query(
        `UPDATE asset_categories SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      res.json({ message: 'Category deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/config — Get all system config as key→value object
// ---------------------------------------------------------------------------
router.get(
  '/config',
  authenticate,
  authorize('admin:manage'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT key, value FROM system_config`
      );
      const config: Record<string, unknown> = {};
      for (const row of result.rows) {
        config[row.key] = row.value;
      }
      res.json(config);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/config — Upsert system config key→value pairs
// ---------------------------------------------------------------------------
router.put(
  '/config',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;

      for (const [key, value] of Object.entries(body)) {
        await pool.query(
          `INSERT INTO system_config (key, value, updated_by)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (key) DO UPDATE
             SET value = $2::jsonb, updated_by = $3, updated_at = NOW()`,
          [key, JSON.stringify(value), req.user!.userId]
        );
      }

      res.json({ message: 'Config updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/notification-config — Get notification type settings
// ---------------------------------------------------------------------------
router.get(
  '/notification-config',
  authenticate,
  authorize('admin:manage'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT value FROM system_config WHERE key = 'notification_config'`
      );
      res.json(result.rowCount && result.rowCount > 0 ? result.rows[0].value : {});
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/notification-config — Upsert notification config
// ---------------------------------------------------------------------------
router.put(
  '/notification-config',
  authenticate,
  authorize('admin:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;

      await pool.query(
        `INSERT INTO system_config (key, value, updated_by)
         VALUES ('notification_config', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE
           SET value = $1::jsonb, updated_by = $2, updated_at = NOW()`,
        [JSON.stringify(body), req.user!.userId]
      );

      res.json({ message: 'Notification config updated' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

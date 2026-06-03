import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

const router = Router();

const VALID_ASSET_TYPES = [
  'Laptop',
  'Desktop',
  'Server',
  'Printer',
  'Router',
  'Switch',
  'Mobile Device',
  'Software License',
] as const;

type AssetType = (typeof VALID_ASSET_TYPES)[number];

/** Generate a unique asset ID: 'ASSET-' + 8 uppercase alphanumeric chars */
function generateAssetId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(8);
  let result = 'ASSET-';
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST /api/assets — Create a new asset
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        name,
        categoryId,
        assetType,
        serialNumber,
        manufacturer,
        model,
        purchaseDate,
        purchaseCost,
        warrantyExpiryDate,
        barcode,
        qrCode,
        notes,
      } = req.body as {
        name?: string;
        categoryId?: string;
        assetType?: string;
        serialNumber?: string;
        manufacturer?: string;
        model?: string;
        purchaseDate?: string;
        purchaseCost?: number;
        warrantyExpiryDate?: string;
        barcode?: string;
        qrCode?: string;
        notes?: string;
      };

      // Validate required fields
      if (!name) throw new ValidationError('name is required');
      if (!categoryId) throw new ValidationError('categoryId is required');
      if (!assetType) throw new ValidationError('assetType is required');
      if (!serialNumber) throw new ValidationError('serialNumber is required');
      if (!manufacturer) throw new ValidationError('manufacturer is required');
      if (!model) throw new ValidationError('model is required');
      if (!purchaseDate) throw new ValidationError('purchaseDate is required');
      if (purchaseCost === undefined || purchaseCost === null) {
        throw new ValidationError('purchaseCost is required');
      }
      if (!warrantyExpiryDate) throw new ValidationError('warrantyExpiryDate is required');

      // Validate assetType
      if (!VALID_ASSET_TYPES.includes(assetType as AssetType)) {
        throw new ValidationError(
          `assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`
        );
      }

      // Check for duplicate serial number
      const dupCheck = await pool.query(
        'SELECT id FROM assets WHERE serial_number = $1',
        [serialNumber]
      );
      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        throw new ConflictError(`Asset with serial number '${serialNumber}' already exists`);
      }

      // Generate unique asset_id (retry on collision, though extremely unlikely)
      let assetId = generateAssetId();
      let idConflict = await pool.query('SELECT id FROM assets WHERE asset_id = $1', [assetId]);
      while (idConflict.rowCount && idConflict.rowCount > 0) {
        assetId = generateAssetId();
        idConflict = await pool.query('SELECT id FROM assets WHERE asset_id = $1', [assetId]);
      }

      // Insert asset
      const insertResult = await pool.query(
        `INSERT INTO assets (
           asset_id, name, category_id, asset_type, serial_number,
           manufacturer, model, purchase_date, purchase_cost,
           warranty_expiry_date, status, barcode, qr_code, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Available',$11,$12,$13)
         RETURNING *`,
        [
          assetId,
          name,
          categoryId,
          assetType,
          serialNumber,
          manufacturer,
          model,
          purchaseDate,
          purchaseCost,
          warrantyExpiryDate,
          barcode ?? null,
          qrCode ?? null,
          notes ?? null,
        ]
      );

      const asset = insertResult.rows[0];

      // Write audit log
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'created', $2, $3::jsonb)`,
        [asset.id, req.user!.userId, JSON.stringify(asset)]
      );

      res.status(201).json(asset);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/assets — List / search assets
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('assets:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        search,
        status,
        categoryId,
        assetType,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = ['a.is_archived = FALSE'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(
          `(a.asset_id ILIKE $${paramIdx} OR a.serial_number ILIKE $${paramIdx} OR a.name ILIKE $${paramIdx} OR a.model ILIKE $${paramIdx})`
        );
        params.push(`%${search}%`);
        paramIdx++;
      }

      if (status) {
        conditions.push(`a.status = $${paramIdx}`);
        params.push(status);
        paramIdx++;
      }

      if (categoryId) {
        conditions.push(`a.category_id = $${paramIdx}`);
        params.push(categoryId);
        paramIdx++;
      }

      if (assetType) {
        conditions.push(`a.asset_type = $${paramIdx}`);
        params.push(assetType);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total
      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM assets a ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      // Fetch page
      const dataResult = await pool.query(
        `SELECT a.*, ac.name AS category_name
           FROM assets a
           LEFT JOIN asset_categories ac ON ac.id = a.category_id
           ${whereClause}
           ORDER BY a.created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limitNum, offset]
      );

      res.json({
        data: dataResult.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/assets/:id — Get single asset
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  authorize('assets:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT a.*, ac.name AS category_name
           FROM assets a
           LEFT JOIN asset_categories ac ON ac.id = a.category_id
          WHERE a.id = $1`,
        [id]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/assets/:id/status — Transition asset status
// ---------------------------------------------------------------------------

/** Permitted status transitions */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  Available: ['Assigned', 'Under Maintenance', 'Lost', 'Retired', 'Disposed'],
  Assigned: ['Available', 'Under Maintenance', 'Retired', 'Disposed'],
  'Under Maintenance': ['Available', 'Retired', 'Disposed'],
  Lost: ['Retired', 'Disposed'],
  Retired: ['Disposed'],
  Disposed: [],
};

router.put(
  '/:id/status',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { status: newStatus, notes } = req.body as { status?: string; notes?: string };

      if (!newStatus) {
        throw new ValidationError('status is required');
      }

      // Fetch existing asset
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const asset = existing.rows[0];
      const previousStatus: string = asset.status;

      // Validate the transition
      const allowed = STATUS_TRANSITIONS[previousStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        throw new ValidationError(
          `Cannot transition from '${previousStatus}' to '${newStatus}'`
        );
      }

      // Update asset status
      const updatedResult = await pool.query(
        `UPDATE assets
            SET status     = $1,
                updated_at = NOW()
          WHERE id = $2
          RETURNING *`,
        [newStatus, id]
      );

      const updated = updatedResult.rows[0];

      // Insert into asset_status_history
      await pool.query(
        `INSERT INTO asset_status_history
           (asset_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [asset.id, previousStatus, newStatus, req.user!.userId, notes ?? null]
      );

      // Insert into audit_logs
      await pool.query(
        `INSERT INTO audit_logs
           (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'status_changed', $2, $3::jsonb)`,
        [
          asset.id,
          req.user!.userId,
          JSON.stringify({ previousStatus, newStatus }),
        ]
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/assets/:id — Update asset
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Fetch existing asset
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const current = existing.rows[0];

      const {
        name,
        categoryId,
        assetType,
        serialNumber,
        manufacturer,
        model,
        purchaseDate,
        purchaseCost,
        warrantyExpiryDate,
        status,
        barcode,
        qrCode,
        notes,
      } = req.body as Record<string, unknown>;

      // Validate assetType if provided
      if (assetType !== undefined && !VALID_ASSET_TYPES.includes(assetType as AssetType)) {
        throw new ValidationError(
          `assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`
        );
      }

      // Check serial number uniqueness if changing
      if (serialNumber !== undefined && serialNumber !== current.serial_number) {
        const dupCheck = await pool.query(
          'SELECT id FROM assets WHERE serial_number = $1 AND id != $2',
          [serialNumber, id]
        );
        if (dupCheck.rowCount && dupCheck.rowCount > 0) {
          throw new ConflictError(`Asset with serial number '${String(serialNumber)}' already exists`);
        }
      }

      const updatedResult = await pool.query(
        `UPDATE assets SET
           name                 = COALESCE($1,  name),
           category_id          = COALESCE($2,  category_id),
           asset_type           = COALESCE($3,  asset_type),
           serial_number        = COALESCE($4,  serial_number),
           manufacturer         = COALESCE($5,  manufacturer),
           model                = COALESCE($6,  model),
           purchase_date        = COALESCE($7,  purchase_date),
           purchase_cost        = COALESCE($8,  purchase_cost),
           warranty_expiry_date = COALESCE($9,  warranty_expiry_date),
           status               = COALESCE($10, status),
           barcode              = COALESCE($11, barcode),
           qr_code              = COALESCE($12, qr_code),
           notes                = COALESCE($13, notes),
           updated_at           = NOW()
         WHERE id = $14
         RETURNING *`,
        [
          name ?? null,
          categoryId ?? null,
          assetType ?? null,
          serialNumber ?? null,
          manufacturer ?? null,
          model ?? null,
          purchaseDate ?? null,
          purchaseCost ?? null,
          warrantyExpiryDate ?? null,
          status ?? null,
          barcode ?? null,
          qrCode ?? null,
          notes ?? null,
          id,
        ]
      );

      const updated = updatedResult.rows[0];

      // Write audit log with snapshot of changed fields
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'updated', $2, $3::jsonb)`,
        [id, req.user!.userId, JSON.stringify({ before: current, after: updated })]
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/assets/:id/assign — Assign asset to an employee
// ---------------------------------------------------------------------------
router.post(
  '/:id/assign',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { employeeId, departmentId, location } = req.body as {
        employeeId?: string;
        departmentId?: string;
        location?: string;
      };

      if (!employeeId) throw new ValidationError('employeeId is required');

      // Fetch existing asset
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const asset = existing.rows[0];

      if (asset.status !== 'Available') {
        throw new ValidationError(
          `Asset cannot be assigned: current status is '${asset.status}'. Asset must be 'Available'.`
        );
      }

      // Insert assignment record
      const assignmentResult = await pool.query(
        `INSERT INTO asset_assignments
           (asset_id, employee_id, department_id, location, assigned_at, assigned_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         RETURNING *`,
        [asset.id, employeeId, departmentId ?? null, location ?? null, req.user!.userId]
      );

      const assignment = assignmentResult.rows[0];

      // Update asset status to Assigned
      await pool.query(
        `UPDATE assets SET status = 'Assigned', updated_at = NOW() WHERE id = $1`,
        [asset.id]
      );

      // Insert status history
      await pool.query(
        `INSERT INTO asset_status_history
           (asset_id, previous_status, new_status, changed_by)
         VALUES ($1, 'Available', 'Assigned', $2)`,
        [asset.id, req.user!.userId]
      );

      // Insert audit log
      await pool.query(
        `INSERT INTO audit_logs
           (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'assigned', $2, $3::jsonb)`,
        [
          asset.id,
          req.user!.userId,
          JSON.stringify({ employeeId, departmentId: departmentId ?? null, location: location ?? null }),
        ]
      );

      res.status(201).json(assignment);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/assets/:id/checkin — Check in (return) an assigned asset
// ---------------------------------------------------------------------------
router.post(
  '/:id/checkin',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Fetch existing asset
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const asset = existing.rows[0];

      // Find active assignment
      const activeAssignment = await pool.query(
        `SELECT * FROM asset_assignments
          WHERE asset_id = $1 AND returned_at IS NULL
          LIMIT 1`,
        [asset.id]
      );

      if (activeAssignment.rowCount === 0) {
        throw new ValidationError('No active assignment found for this asset');
      }

      const assignment = activeAssignment.rows[0];

      // Update assignment: set returned_at and returned_by
      const updatedAssignmentResult = await pool.query(
        `UPDATE asset_assignments
            SET returned_at = NOW(),
                returned_by = $1,
                updated_at  = NOW()
          WHERE id = $2
          RETURNING *`,
        [req.user!.userId, assignment.id]
      );

      const updatedAssignment = updatedAssignmentResult.rows[0];

      // Update asset status to Available
      await pool.query(
        `UPDATE assets SET status = 'Available', updated_at = NOW() WHERE id = $1`,
        [asset.id]
      );

      // Insert status history
      await pool.query(
        `INSERT INTO asset_status_history
           (asset_id, previous_status, new_status, changed_by)
         VALUES ($1, 'Assigned', 'Available', $2)`,
        [asset.id, req.user!.userId]
      );

      // Insert audit log
      await pool.query(
        `INSERT INTO audit_logs
           (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'checked_in', $2, $3::jsonb)`,
        [
          asset.id,
          req.user!.userId,
          JSON.stringify({ assignmentId: assignment.id }),
        ]
      );

      res.json(updatedAssignment);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/assets/:id/history — Get assignment history for an asset
// ---------------------------------------------------------------------------
router.get(
  '/:id/history',
  authenticate,
  authorize('assets:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Verify asset exists
      const existing = await pool.query('SELECT id FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const result = await pool.query(
        `SELECT
           aa.*,
           e.full_name        AS employee_full_name,
           e.employee_number  AS employee_number,
           ab.email           AS assigned_by_email,
           rb.email           AS returned_by_email
         FROM asset_assignments aa
         LEFT JOIN employees e  ON e.id  = aa.employee_id
         LEFT JOIN users     ab ON ab.id = aa.assigned_by
         LEFT JOIN users     rb ON rb.id = aa.returned_by
         WHERE aa.asset_id = $1
         ORDER BY aa.assigned_at DESC`,
        [id]
      );

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/assets/:id — Archive (soft delete) asset
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('assets:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Asset not found');
      }

      const asset = existing.rows[0];

      if (asset.status === 'Assigned') {
        throw new ValidationError(
          'Cannot archive an assigned asset. Please check in the asset first.'
        );
      }

      const archivedResult = await pool.query(
        `UPDATE assets
            SET is_archived = TRUE,
                status      = 'Retired',
                updated_at  = NOW()
          WHERE id = $1
          RETURNING *`,
        [id]
      );

      const archived = archivedResult.rows[0];

      // Write audit log
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('asset', $1, 'archived', $2, $3::jsonb)`,
        [id, req.user!.userId, JSON.stringify(archived)]
      );

      res.json({ message: 'Asset archived successfully', asset: archived });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

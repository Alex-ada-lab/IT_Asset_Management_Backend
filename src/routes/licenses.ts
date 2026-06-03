import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/licenses — Create a software license
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('licenses:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        softwareName,
        vendorId,
        licenseKey,
        licenseType,
        totalSeats,
        purchaseDate,
        expiryDate,
      } = req.body as {
        softwareName?: string;
        vendorId?: string;
        licenseKey?: string;
        licenseType?: string;
        totalSeats?: number;
        purchaseDate?: string;
        expiryDate?: string;
      };

      if (!softwareName) throw new ValidationError('softwareName is required');
      if (!vendorId) throw new ValidationError('vendorId is required');
      if (!licenseKey) throw new ValidationError('licenseKey is required');
      if (!licenseType) throw new ValidationError('licenseType is required');
      if (totalSeats === undefined || totalSeats === null) throw new ValidationError('totalSeats is required');
      if (!purchaseDate) throw new ValidationError('purchaseDate is required');
      if (!expiryDate) throw new ValidationError('expiryDate is required');

      const result = await pool.query(
        `INSERT INTO software_licenses
           (software_name, vendor_id, license_key, license_type, total_seats, used_seats, purchase_date, expiry_date)
         VALUES ($1,$2,$3,$4,$5,0,$6,$7)
         RETURNING *`,
        [softwareName, vendorId, licenseKey, licenseType, totalSeats, purchaseDate, expiryDate]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/licenses — List licenses (paginated)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('licenses:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { search, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`(sl.software_name ILIKE $${paramIdx} OR sl.license_key ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM software_licenses sl ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT sl.*, v.name AS vendor_name
           FROM software_licenses sl
           LEFT JOIN vendors v ON v.id = sl.vendor_id
           ${whereClause}
           ORDER BY sl.created_at DESC
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
// GET /api/licenses/compliance — License compliance overview
// ---------------------------------------------------------------------------
router.get(
  '/compliance',
  authenticate,
  authorize('licenses:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT sl.id, sl.software_name, v.name AS vendor_name,
                sl.total_seats, sl.used_seats,
                (sl.total_seats - sl.used_seats) AS available_seats,
                sl.expiry_date, sl.license_type
           FROM software_licenses sl
           LEFT JOIN vendors v ON v.id = sl.vendor_id
           ORDER BY sl.expiry_date ASC`
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/licenses/:id/install — Install license on an asset
// ---------------------------------------------------------------------------
router.post(
  '/:id/install',
  authenticate,
  authorize('licenses:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { assetId } = req.body as { assetId?: string };

      if (!assetId) throw new ValidationError('assetId is required');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock and fetch license
        const licResult = await client.query(
          'SELECT * FROM software_licenses WHERE id = $1 FOR UPDATE',
          [id]
        );
        if (licResult.rowCount === 0) throw new NotFoundError('License not found');
        const license = licResult.rows[0];

        if (license.used_seats >= license.total_seats) {
          throw new ValidationError('License seat limit reached');
        }

        // Insert installation record
        const installResult = await client.query(
          `INSERT INTO license_installations (license_id, asset_id, installed_by)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [id, assetId, req.user!.userId]
        );

        // Increment used_seats
        await client.query(
          `UPDATE software_licenses SET used_seats = used_seats + 1, updated_at = NOW() WHERE id = $1`,
          [id]
        );

        await client.query('COMMIT');
        res.status(201).json(installResult.rows[0]);
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
// DELETE /api/licenses/:id/install/:installId — Uninstall license
// ---------------------------------------------------------------------------
router.delete(
  '/:id/install/:installId',
  authenticate,
  authorize('licenses:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, installId } = req.params;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update installation
        const result = await client.query(
          `UPDATE license_installations
              SET uninstalled_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND license_id = $2
            RETURNING *`,
          [installId, id]
        );
        if (result.rowCount === 0) throw new NotFoundError('Installation record not found');

        // Decrement used_seats (min 0)
        await client.query(
          `UPDATE software_licenses
              SET used_seats = GREATEST(0, used_seats - 1), updated_at = NOW()
            WHERE id = $1`,
          [id]
        );

        await client.query('COMMIT');
        res.json({ message: 'License uninstalled', installation: result.rows[0] });
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

export default router;

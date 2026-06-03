import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

const VALID_ITEM_TYPES = ['Asset', 'License'] as const;
type ItemType = (typeof VALID_ITEM_TYPES)[number];

// ---------------------------------------------------------------------------
// POST /api/purchase-orders — Create a purchase order
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('procurement:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        vendorId,
        itemType,
        itemDescription,
        quantity,
        unitCost,
        totalCost,
        orderDate,
        invoiceReference,
      } = req.body as {
        vendorId?: string;
        itemType?: string;
        itemDescription?: string;
        quantity?: number;
        unitCost?: number;
        totalCost?: number;
        orderDate?: string;
        invoiceReference?: string;
      };

      if (!vendorId) throw new ValidationError('vendorId is required');
      if (!itemType) throw new ValidationError('itemType is required');
      if (!VALID_ITEM_TYPES.includes(itemType as ItemType)) {
        throw new ValidationError(`itemType must be one of: ${VALID_ITEM_TYPES.join(', ')}`);
      }
      if (!itemDescription) throw new ValidationError('itemDescription is required');
      if (quantity === undefined || quantity === null) throw new ValidationError('quantity is required');
      if (unitCost === undefined || unitCost === null) throw new ValidationError('unitCost is required');
      if (totalCost === undefined || totalCost === null) throw new ValidationError('totalCost is required');
      if (!orderDate) throw new ValidationError('orderDate is required');
      if (!invoiceReference) throw new ValidationError('invoiceReference is required');

      const result = await pool.query(
        `INSERT INTO purchase_orders
           (vendor_id, item_type, item_description, quantity, unit_cost, total_cost,
            order_date, invoice_reference, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending',$9)
         RETURNING *`,
        [vendorId, itemType, itemDescription, quantity, unitCost, totalCost, orderDate, invoiceReference, req.user!.userId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/purchase-orders — List purchase orders (paginated)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('procurement:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { vendorId, status, page = '1', limit = '20' } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (vendorId) {
        conditions.push(`po.vendor_id = $${paramIdx++}`);
        params.push(vendorId);
      }
      if (status) {
        conditions.push(`po.status = $${paramIdx++}`);
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM purchase_orders po ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT po.*, v.name AS vendor_name
           FROM purchase_orders po
           LEFT JOIN vendors v ON v.id = po.vendor_id
           ${whereClause}
           ORDER BY po.created_at DESC
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
// GET /api/purchase-orders/:id — Get single purchase order
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  authorize('procurement:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT po.*, v.name AS vendor_name
           FROM purchase_orders po
           LEFT JOIN vendors v ON v.id = po.vendor_id
          WHERE po.id = $1`,
        [id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Purchase order not found');
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/purchase-orders/:id/receive — Mark purchase order as received
// ---------------------------------------------------------------------------
router.put(
  '/:id/receive',
  authenticate,
  authorize('procurement:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT id FROM purchase_orders WHERE id = $1', [id]);
      if (existing.rowCount === 0) throw new NotFoundError('Purchase order not found');

      const result = await pool.query(
        `UPDATE purchase_orders
            SET status = 'Received', received_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

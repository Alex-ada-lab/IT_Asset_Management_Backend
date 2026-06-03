import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/employees — Create a new employee
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fullName, employeeNumber, email, departmentId, jobTitle } = req.body as {
        fullName?: string;
        employeeNumber?: string;
        email?: string;
        departmentId?: string;
        jobTitle?: string;
      };

      if (!fullName) throw new ValidationError('fullName is required');
      if (!employeeNumber) throw new ValidationError('employeeNumber is required');
      if (!email) throw new ValidationError('email is required');
      if (!departmentId) throw new ValidationError('departmentId is required');
      if (!jobTitle) throw new ValidationError('jobTitle is required');

      // Check for duplicate email or employeeNumber
      const dupCheck = await pool.query(
        'SELECT id, email, employee_number FROM employees WHERE email = $1 OR employee_number = $2',
        [email, employeeNumber]
      );
      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        const existing = dupCheck.rows[0];
        if (existing.email === email) {
          throw new ConflictError(`Employee with email '${email}' already exists`);
        }
        throw new ConflictError(
          `Employee with employee number '${employeeNumber}' already exists`
        );
      }

      const result = await pool.query(
        `INSERT INTO employees (full_name, employee_number, email, department_id, job_title)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [fullName, employeeNumber, email, departmentId, jobTitle]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/employees — List / search employees
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('employees:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        search,
        departmentId,
        isActive,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(
          `(e.full_name ILIKE $${paramIdx} OR e.email ILIKE $${paramIdx} OR e.employee_number ILIKE $${paramIdx})`
        );
        params.push(`%${search}%`);
        paramIdx++;
      }

      if (departmentId) {
        conditions.push(`e.department_id = $${paramIdx}`);
        params.push(departmentId);
        paramIdx++;
      }

      if (isActive !== undefined) {
        conditions.push(`e.is_active = $${paramIdx}`);
        params.push(isActive === 'true');
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM employees e ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const dataResult = await pool.query(
        `SELECT e.*, d.name AS department_name
           FROM employees e
           LEFT JOIN departments d ON d.id = e.department_id
           ${whereClause}
           ORDER BY e.created_at DESC
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
// GET /api/employees/:id — Get single employee with assignment history
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  authorize('employees:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const empResult = await pool.query(
        `SELECT e.*, d.name AS department_name
           FROM employees e
           LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.id = $1`,
        [id]
      );

      if (empResult.rowCount === 0) {
        throw new NotFoundError('Employee not found');
      }

      const employee = empResult.rows[0];

      // Fetch asset assignment history
      const assignmentsResult = await pool.query(
        `SELECT aa.id, aa.asset_id, a.name AS asset_name, aa.assigned_at, aa.returned_at,
                aa.location, aa.department_id
           FROM asset_assignments aa
           JOIN assets a ON a.id = aa.asset_id
          WHERE aa.employee_id = $1
          ORDER BY aa.assigned_at DESC`,
        [id]
      );

      res.json({ ...employee, assignments: assignmentsResult.rows });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/employees/:id/deactivate — Deactivate employee
// ---------------------------------------------------------------------------
router.put(
  '/:id/deactivate',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Employee not found');
      }

      const employee = existing.rows[0];

      // Set is_active = false
      const updatedResult = await pool.query(
        `UPDATE employees SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      const updated = updatedResult.rows[0];

      // Find all active assignments for this employee
      const activeAssignments = await pool.query(
        `SELECT aa.id, aa.asset_id, a.name AS asset_name
           FROM asset_assignments aa
           JOIN assets a ON a.id = aa.asset_id
          WHERE aa.employee_id = $1 AND aa.returned_at IS NULL`,
        [id]
      );

      // Create notifications for admins if there are active assignments
      if (activeAssignments.rowCount && activeAssignments.rowCount > 0) {
        const assetList = activeAssignments.rows
          .map((r: { asset_name: string }) => r.asset_name)
          .join(', ');

        const message = `Employee "${employee.full_name}" has been deactivated. The following assets need review: ${assetList}`;

        // Find admin users to notify
        const adminResult = await pool.query(
          `SELECT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
            WHERE r.name = 'Administrator' AND u.is_active = TRUE
            LIMIT 10`
        );

        const dedupKey = `employee_deactivated_${id}`;

        if (adminResult.rowCount && adminResult.rowCount > 0) {
          for (const admin of adminResult.rows) {
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, dedup_key)
               VALUES ($1, 'employee_deactivated', 'Employee Deactivated - Assets Need Review', $2, 'employee', $3, $4)
               ON CONFLICT (dedup_key) DO NOTHING`,
              [admin.id, message, id, `${dedupKey}_${admin.id}`]
            );
          }
        }
      }

      // Write audit log
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('employee', $1, 'deactivated', $2, $3::jsonb)`,
        [id, req.user!.userId, JSON.stringify({ is_active: false })]
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/employees/:id — Update employee
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('employees:write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        throw new NotFoundError('Employee not found');
      }

      const current = existing.rows[0];

      const { fullName, employeeNumber, email, departmentId, jobTitle, isActive } =
        req.body as Record<string, unknown>;

      // Check uniqueness if email or employeeNumber is changing
      if (email !== undefined && email !== current.email) {
        const dupEmail = await pool.query(
          'SELECT id FROM employees WHERE email = $1 AND id != $2',
          [email, id]
        );
        if (dupEmail.rowCount && dupEmail.rowCount > 0) {
          throw new ConflictError(`Employee with email '${String(email)}' already exists`);
        }
      }

      if (employeeNumber !== undefined && employeeNumber !== current.employee_number) {
        const dupNum = await pool.query(
          'SELECT id FROM employees WHERE employee_number = $1 AND id != $2',
          [employeeNumber, id]
        );
        if (dupNum.rowCount && dupNum.rowCount > 0) {
          throw new ConflictError(
            `Employee with employee number '${String(employeeNumber)}' already exists`
          );
        }
      }

      const updatedResult = await pool.query(
        `UPDATE employees SET
           full_name       = COALESCE($1, full_name),
           employee_number = COALESCE($2, employee_number),
           email           = COALESCE($3, email),
           department_id   = COALESCE($4, department_id),
           job_title       = COALESCE($5, job_title),
           is_active       = COALESCE($6, is_active),
           updated_at      = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          fullName ?? null,
          employeeNumber ?? null,
          email ?? null,
          departmentId ?? null,
          jobTitle ?? null,
          isActive ?? null,
          id,
        ]
      );

      const updated = updatedResult.rows[0];

      // Write audit log
      await pool.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, changed_fields)
         VALUES ('employee', $1, 'updated', $2, $3::jsonb)`,
        [id, req.user!.userId, JSON.stringify({ before: current, after: updated })]
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { Permission, ROLE_PERMISSIONS } from '../config/permissions';
import { ForbiddenError, UnauthorizedError } from '../errors';

// Simple UUID v4 format check
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authorize(permission: Permission) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { roleId } = req.user;

      // Guard: missing, empty, or non-UUID roleId means no role assigned
      if (!roleId || !UUID_REGEX.test(roleId)) {
        throw new ForbiddenError('No role assigned. Ask an administrator to assign you a role.');
      }

      const result = await pool.query<{ name: string }>(
        'SELECT name FROM roles WHERE id = $1',
        [roleId]
      );

      if (result.rowCount === 0) {
        throw new ForbiddenError('Your assigned role no longer exists. Contact an administrator.');
      }

      const roleName = result.rows[0].name;
      const permissions = ROLE_PERMISSIONS[roleName] ?? [];

      if (!permissions.includes(permission)) {
        throw new ForbiddenError('You do not have permission to perform this action');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

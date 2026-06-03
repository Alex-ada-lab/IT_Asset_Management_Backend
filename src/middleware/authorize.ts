import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { Permission, ROLE_PERMISSIONS } from '../config/permissions';
import { ForbiddenError, UnauthorizedError } from '../errors';

/**
 * Authorization middleware factory.
 *
 * Returns an Express middleware that checks whether the authenticated user
 * holds the given permission. Must be used AFTER the `authenticate` middleware
 * (which populates `req.user`).
 *
 * @param permission - The permission required to access the route.
 */
export function authorize(permission: Permission) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { roleId } = req.user;

      const result = await pool.query<{ name: string }>(
        'SELECT name FROM roles WHERE id = $1',
        [roleId]
      );

      if (result.rowCount === 0) {
        throw new ForbiddenError('You do not have permission to perform this action');
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

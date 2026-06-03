import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt';
import { UnauthorizedError } from '../errors';

/**
 * JWT authentication middleware.
 *
 * - Extracts the Bearer token from the Authorization header.
 * - Verifies the token signature and expiry.
 * - Checks the token's `jti` is NOT in the token_denylist table.
 * - Attaches the decoded payload to `req.user`.
 *
 * Throws UnauthorizedError on any failure so the centralised error handler
 * returns a consistent 401 response.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    const jti = payload['jti'] as string | undefined;
    if (!jti) {
      throw new UnauthorizedError('Invalid token: missing jti claim');
    }

    // Check token is not in the denylist
    const result = await pool.query(
      'SELECT id FROM token_denylist WHERE token_jti = $1',
      [jti]
    );
    if (result.rowCount && result.rowCount > 0) {
      throw new UnauthorizedError('Token has been invalidated');
    }

    req.user = {
      userId: payload['userId'] as string,
      email: payload['email'] as string,
      roleId: payload['roleId'] as string,
      jti,
    };

    next();
  } catch (err) {
    next(err);
  }
}

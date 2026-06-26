import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool';
import { signToken, verifyToken, extractTokenFromHeader } from '../utils/jwt';
import { ValidationError, UnauthorizedError, ConflictError } from '../errors';
import { authenticate } from '../middleware/authenticate';

const router = Router();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const LOCKOUT_WINDOW_MINUTES = 15;

// ---------------------------------------------------------------------------
// Helper: write an audit log entry
// ---------------------------------------------------------------------------
async function writeAuditLog(
  entityType: string,
  action: string,
  actingUserId: string | null,
  ipAddress: string | null,
  entityId?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, acting_user_id, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [entityType, entityId ?? null, action, actingUserId, ipAddress]
  );
}

// ---------------------------------------------------------------------------
// 2.1  POST /api/auth/register
// ---------------------------------------------------------------------------
router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, roleId } = req.body as {
        email?: string;
        password?: string;
        roleId?: string;
      };

      if (!email || typeof email !== 'string') {
        throw new ValidationError('email is required');
      }
      if (!password || typeof password !== 'string') {
        throw new ValidationError('password is required');
      }

      // Check for duplicate email
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ConflictError('A user with that email already exists');
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, role_id)
         VALUES ($1, $2, $3)
         RETURNING id, email, role_id, created_at`,
        [email.toLowerCase(), passwordHash, roleId ?? null]
      );

      const user = insertResult.rows[0] as {
        id: string;
        email: string;
        role_id: string | null;
        created_at: string;
      };

      res.status(201).json({
        id: user.id,
        email: user.email,
        roleId: user.role_id,
        createdAt: user.created_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// 2.2  POST /api/auth/login
// ---------------------------------------------------------------------------
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email || typeof email !== 'string') {
        throw new ValidationError('email is required');
      }
      if (!password || typeof password !== 'string') {
        throw new ValidationError('password is required');
      }

      // Fetch user — use a generic error to avoid revealing which field is wrong
      const userResult = await pool.query(
        `SELECT id, email, password_hash, role_id, failed_login_attempts, locked_until
         FROM users
         WHERE email = $1 AND is_active = TRUE`,
        [email.toLowerCase()]
      );

      const INVALID_CREDENTIALS = 'Invalid credentials';

      if (!userResult.rowCount || userResult.rowCount === 0) {
        // User not found — still do a dummy compare to prevent timing attacks
        await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000');
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }

      const user = userResult.rows[0] as {
        id: string;
        email: string;
        password_hash: string;
        role_id: string | null;
        failed_login_attempts: number;
        locked_until: Date | null;
      };

      // Check account lock
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new UnauthorizedError('Account temporarily locked');
      }

      // Check if we're within the lockout window and already at max attempts
      // (handles the case where locked_until has expired but attempts haven't reset)
      const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      const recentFailuresResult = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM audit_logs
         WHERE entity_type = 'auth'
           AND action = 'login_failed'
           AND acting_user_id = $1
           AND timestamp >= $2`,
        [user.id, windowStart.toISOString()]
      );
      const recentFailures = parseInt(
        (recentFailuresResult.rows[0] as { cnt: string }).cnt,
        10
      );

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        const newAttempts = user.failed_login_attempts + 1;

        // Write failed login audit entry
        await writeAuditLog('auth', 'login_failed', user.id, req.ip ?? null, null);

        if (recentFailures + 1 >= MAX_FAILED_ATTEMPTS) {
          // Lock the account
          const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await pool.query(
            `UPDATE users
             SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW()
             WHERE id = $3`,
            [newAttempts, lockedUntil.toISOString(), user.id]
          );
          throw new UnauthorizedError('Account temporarily locked');
        }

        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1, updated_at = NOW()
           WHERE id = $2`,
          [newAttempts, user.id]
        );

        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }

      // Successful login — reset counters and update last_login_at
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      // Issue JWT
      const token = signToken({
        userId: user.id,
        email: user.email,
        roleId: user.role_id ?? null,
      });

      // Write audit log
      await writeAuditLog('auth', 'login', user.id, req.ip ?? null, null);

      res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          roleId: user.role_id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// 2.3  POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      const payload = verifyToken(token);

      const jti = payload['jti'] as string;
      // exp is seconds since epoch
      const exp = payload['exp'] as number | undefined;
      const expiresAt = exp
        ? new Date(exp * 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(); // fallback: 1h from now

      // Add token to denylist
      await pool.query(
        `INSERT INTO token_denylist (token_jti, expires_at)
         VALUES ($1, $2)
         ON CONFLICT (token_jti) DO NOTHING`,
        [jti, expiresAt]
      );

      // Write audit log
      const userId = req.user?.userId ?? null;
      await writeAuditLog('auth', 'logout', userId, req.ip ?? null, null);

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

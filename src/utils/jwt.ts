import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { UnauthorizedError } from '../errors';

/**
 * Returns the JWT secret from the environment.
 * Throws at call-time (not module load time) so tests can set the env var
 * before importing this module.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Signs a payload and returns a JWT string.
 * Automatically injects a `jti` (JWT ID) claim using uuid v4.
 *
 * @param payload   - Arbitrary object to embed in the token.
 * @param expiresIn - Token lifetime (e.g. '1h', '7d'). Defaults to '1h'.
 */
export function signToken(payload: object, expiresIn = '1h'): string {
  const jti = uuidv4();
  return jwt.sign({ ...payload, jti }, getSecret(), { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies a JWT and returns the decoded payload.
 *
 * @throws {UnauthorizedError} if the token is missing, expired, or invalid.
 */
export function verifyToken(token: string): jwt.JwtPayload {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === 'string') {
      // jwt.verify can return a string for non-object payloads; treat as invalid
      throw new UnauthorizedError('Invalid token payload');
    }
    return decoded;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Extracts the Bearer token from an Authorization header value.
 *
 * @param authHeader - Value of the `Authorization` request header.
 * @throws {UnauthorizedError} if the header is absent or not a Bearer token.
 */
export function extractTokenFromHeader(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new UnauthorizedError('Authorization header is missing');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    throw new UnauthorizedError('Authorization header must be in the format: Bearer <token>');
  }

  return parts[1];
}

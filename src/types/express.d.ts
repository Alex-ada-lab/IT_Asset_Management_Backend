declare namespace Express {
  interface Request {
    user?: { userId: string; email: string; roleId: string; jti?: string };
  }
}

import type { NextFunction, Request, Response } from "express";
import { verifyAdminAccessToken, type AdminRole } from "../Routes/admin/Auth/token.ts";

declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      adminRole?: AdminRole;
      adminSessionId?: string;
    }
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const token = header.slice("Bearer ".length);
  const payload = verifyAdminAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.adminId = payload.aid;
  req.adminRole = payload.role;
  req.adminSessionId = payload.sid;
  next();
}

// Three roles with a strict ordering are a list, not a matrix -- no
// lib/adminPermissions.ts.
export function requireAdminRole(...allowed: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminRole || !allowed.includes(req.adminRole)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

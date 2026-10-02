import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../Routes/user/Auth/token.ts";

// Augmenting the global `Express` namespace (rather than `declare module
// "express-serve-static-core"`) sidesteps resolving that module specifier at
// all — express-serve-static-core's own `Request` interface extends
// `Express.Request`, so this merges in the same place either way.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.userId = payload.uid;
  req.sessionId = payload.sid;
  next();
}

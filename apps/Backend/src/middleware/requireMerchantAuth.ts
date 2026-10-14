import type { NextFunction, Request, Response } from "express";
import { verifyMerchantAccessToken } from "../Routes/merchant/Auth/token.ts";

declare global {
  namespace Express {
    interface Request {
      merchantUserId?: string;
      merchantSessionId?: string;
    }
  }
}

export function requireMerchantAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const token = header.slice("Bearer ".length);
  const payload = verifyMerchantAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.merchantUserId = payload.mid;
  req.merchantSessionId = payload.sid;
  next();
}

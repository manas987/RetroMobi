import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

// Express 5's req.query is a getter-only property, so query results can't be
// written back to it like req.body — they go on this new field instead.
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

export function validate(schema: ZodType, source: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === "query" ? req.query : req.body);
    if (!result.success) {
      res.status(400).json({
        error: "invalid_request",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    if (source === "query") {
      req.validatedQuery = result.data;
    } else {
      req.body = result.data;
    }
    next();
  };
}

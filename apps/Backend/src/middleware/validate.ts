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

function pick(req: Request, source: "body" | "query" | "params") {
  if (source === "query") return req.query;
  if (source === "params") return req.params;
  return req.body;
}

export function validate(schema: ZodType, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(pick(req, source));
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
    } else if (source === "params") {
      // Deliberately not written back: Express 5 re-derives req.params per
      // route layer, so an assignment here would be overwritten anyway.
      // Callers keep reading through `pathParam`; this only rejects bad input.
    } else {
      req.body = result.data;
    }
    next();
  };
}

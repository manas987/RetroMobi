import { expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "./errorHandler.ts";

function run(err: unknown) {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) { out.status = code; return this; },
    json(body: unknown) { out.body = body; return this; },
  } as unknown as Response;
  errorHandler(err, {} as Request, res, (() => {}) as NextFunction);
  return out;
}

test("a malformed id from the URL is a 400, not a 500", () => {
  const pgError = Object.assign(new Error('invalid input syntax for type uuid: "abc"'), { code: "22P02" });
  expect(run(pgError)).toEqual({ status: 400, body: { error: "invalid_id" } });
});

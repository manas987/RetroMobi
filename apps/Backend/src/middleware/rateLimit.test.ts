// No test contract provided. Minimal check that the 61st request in a window
// gets 429 + Retry-After, and the 60th still goes through.
import { describe, expect, test } from "bun:test";
import { rateLimit } from "./rateLimit.ts";

function fakeReqRes(ip: string, path: string) {
  const req: any = { ip, path };
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    json() {
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getHeaders: () => headers };
}

describe("rateLimit", () => {
  test("allows up to 60 requests per minute per ip+path, then 429s", async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 255)}`;
    const path = "/api/user/search";

    for (let i = 0; i < 60; i++) {
      const { req, res, getStatus } = fakeReqRes(ip, path);
      let calledNext = false;
      await rateLimit(req, res, () => {
        calledNext = true;
      });
      expect(calledNext).toBe(true);
      expect(getStatus()).toBe(200);
    }

    const { req, res, getStatus, getHeaders } = fakeReqRes(ip, path);
    let calledNext = false;
    await rateLimit(req, res, () => {
      calledNext = true;
    });
    expect(calledNext).toBe(false);
    expect(getStatus()).toBe(429);
    expect(getHeaders()["Retry-After"]).toBeDefined();
  });
});

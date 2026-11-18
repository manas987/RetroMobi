import { expect, test } from "bun:test";
import { app } from "./index.ts";

test("client IPs come from the same-host proxy's X-Forwarded-For, never from outside", () => {
  const trusts = app.get("trust proxy fn") as (addr: string, i: number) => boolean;
  expect(trusts("127.0.0.1", 0)).toBe(true);
  expect(trusts("::1", 0)).toBe(true);
  expect(trusts("203.0.113.5", 0)).toBe(false);
});

import { afterEach, expect, mock, test } from "bun:test";
import type { Session } from "./session";

let session: Session | null;
mock.module("./session", () => ({
  getSession: () => session,
  setSession: (tokens: Omit<Session, "deviceId"> | null) => { session = tokens && { ...tokens, deviceId: "phone" }; },
}));

const { api, errorMessage, NetworkError } = await import("./client");
const { configureApi } = await import("./config");
configureApi({ portal: "merchant", baseUrl: "https://example.test" });

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; session = null; });

const old = { accessToken: "old", refreshToken: "old-refresh", deviceId: "phone" };
const unauthorised = () => Response.json({ error: "unauthorized" }, { status: 401 });

test("a lost connection during refresh does not discard the saved session", async () => {
  session = old;
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input).endsWith("/auth/refresh")) throw new Error("offline");
    return unauthorised();
  }, { preconnect: realFetch.preconnect });
  await expect(api("/shops")).rejects.toBeInstanceOf(NetworkError);
  expect(session).toBe(old);
});

test("a late refresh response cannot replace a different signed-in session", async () => {
  session = old;
  const next = { accessToken: "next", refreshToken: "next-refresh", deviceId: "phone" };
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input).endsWith("/auth/refresh")) {
      session = next;
      return Response.json({ accessToken: "late", refreshToken: "late-refresh" });
    }
    return unauthorised();
  }, { preconnect: realFetch.preconnect });
  await expect(api("/shops")).rejects.toMatchObject({ status: 401 });
  expect(session).toBe(next);
});

test("an API rate limit preserves the Retry-After header for the UI", async () => {
  globalThis.fetch = Object.assign(async () => Response.json({ error: "rate_limited" }, {
    status: 429,
    headers: { "Retry-After": "24" },
  }), { preconnect: realFetch.preconnect });
  const error = await api("/shops").catch((err: unknown) => err);
  expect(errorMessage(error)).toBe("Too many requests. Wait 24 seconds and try again.");
});

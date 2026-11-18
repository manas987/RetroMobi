import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { verifyFirebasePhoneToken } from "./firebase.ts";

// A local key stands in for Google's: the certs endpoint is mocked to serve its
// public half, so this exercises the real signature + claim checks.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";
const PROJECT = "retromobi-test";
const PHONE = "+919999999999";

const b64url = (v: object | Buffer) =>
  (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");

function token(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: "RS256", kid: KID, typ: "JWT" });
  const body = b64url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "firebase-uid",
    auth_time: now - 5,
    iat: now - 5,
    exp: now + 3600,
    phone_number: PHONE,
    ...overrides,
  });
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64url(signature)}`;
}

const realFetch = globalThis.fetch;
beforeAll(() => {
  process.env.FIREBASE_PROJECT_ID = PROJECT;
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify({ [KID]: publicKey.export({ type: "spki", format: "pem" }) }), {
      headers: { "cache-control": "public, max-age=3600" },
    }),
  ) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.FIREBASE_PROJECT_ID;
});

describe("verifyFirebasePhoneToken", () => {
  test("accepts a valid token for the phone being signed in", async () => {
    expect(await verifyFirebasePhoneToken(token(), PHONE)).toBe(true);
  });

  test("rejects a token issued by another project", async () => {
    expect(await verifyFirebasePhoneToken(token({ iss: "https://securetoken.google.com/someone-else" }), PHONE)).toBe(false);
  });

  test("rejects a token for another audience", async () => {
    expect(await verifyFirebasePhoneToken(token({ aud: "someone-else" }), PHONE)).toBe(false);
  });

  // Otherwise a code sent to my phone signs me into your account.
  test("rejects a token that proves a different phone", async () => {
    expect(await verifyFirebasePhoneToken(token({ phone_number: "+918888888888" }), PHONE)).toBe(false);
  });

  test("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    expect(await verifyFirebasePhoneToken(token({ iat: past, auth_time: past, exp: past + 3600 }), PHONE)).toBe(false);
  });

  test("rejects a token signed by a different key", async () => {
    const [head, body] = token().split(".");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const forged = createSign("RSA-SHA256").update(`${head}.${body}`).sign(other);
    expect(await verifyFirebasePhoneToken(`${head}.${body}.${b64url(forged)}`, PHONE)).toBe(false);
  });
});

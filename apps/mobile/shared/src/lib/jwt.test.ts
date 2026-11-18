import { expect, test } from "bun:test";
import { decodeJwtSubject } from "./jwt";

test("extracts account scope from unpadded base64url without a browser global", () => {
  const token = (body: object) => `header.${Buffer.from(JSON.stringify(body)).toString("base64url")}.signature`;
  expect(decodeJwtSubject(token({ name: "आशा", mid: "merchant" }))).toBe("merchant");
  expect(decodeJwtSubject(token({ uid: "rider" }))).toBe("rider");
  expect(decodeJwtSubject(token({ uid: 100 }))).toBeNull();
  expect(decodeJwtSubject("broken")).toBeNull();
});

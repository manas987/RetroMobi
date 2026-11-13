import { describe, expect, test } from "bun:test";
import { ForeignStorageKeyError, assertOwnUpload } from "./storage.ts";

describe("assertOwnUpload", () => {
  const prefix = "licences/7f3c2c1e-0000-4000-8000-000000000001/";

  test("accepts the keys our presigns hand out", () => {
    expect(() => assertOwnUpload(`${prefix}1731491234567`, prefix)).not.toThrow();
    expect(() => assertOwnUpload("vehicles/v1/media/0d9b1c4e-1f2a-4b3c-9d8e-7f6a5b4c3d2e", "vehicles/v1/media/")).not.toThrow();
  });

  test("refuses another record's key, a nested path, or a key outside the prefix", () => {
    for (const key of [
      "licences/7f3c2c1e-0000-4000-8000-000000000002/1731491234567",
      `${prefix}1731491234567/../../riders/x/verification/s`,
      `${prefix}../other/1731491234567`,
      "riders/r1/verification/s1",
      prefix,
    ]) {
      expect(() => assertOwnUpload(key, prefix)).toThrow(ForeignStorageKeyError);
    }
  });
});

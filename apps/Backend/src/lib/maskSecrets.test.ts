import { describe, expect, test } from "bun:test";
import { dlLast4, maskDl, redact } from "./maskSecrets.ts";
import { hashLicenceNumber, normaliseLicenceNumber } from "./verificationHash.ts";

describe("maskDl", () => {
  test("keeps the state/RTO prefix and the last four", () => {
    expect(maskDl("UK0720190001234")).toBe("UK07*******1234");
  });

  test("a short number leaks less, not proportionally more", () => {
    expect(maskDl("AB123456")).toBe("****3456");
    expect(maskDl("ABCD")).toBe("****");
  });

  test("a masked value never round-trips to itself", () => {
    for (const value of ["UK0720190001234", "AB123456", "ABCD", "A"]) {
      expect(maskDl(value)).not.toBe(value);
    }
  });

  test("surrounding whitespace is not counted as licence characters", () => {
    expect(maskDl("  UK0720190001234  ")).toBe("UK07*******1234");
  });

  test("dlLast4 is what a staff member reads off the card", () => {
    expect(dlLast4("UK0720190001234")).toBe("1234");
  });
});

describe("normaliseLicenceNumber", () => {
  test("case and separators are presentation, so they collide", () => {
    const canonical = "UK0720190001234";
    for (const written of ["uk0720190001234", "UK-07 2019 0001234", "UK07/2019/0001234"]) {
      expect(normaliseLicenceNumber(written)).toBe(canonical);
    }
  });

  test("alphanumerics are never altered -- a dropped character is someone else's licence", () => {
    expect(normaliseLicenceNumber("MH4820240007455")).toBe("MH4820240007455");
    expect(normaliseLicenceNumber("DL14 2011 0012345")).toBe("DL1420110012345");
  });

  test("the same licence written three ways hashes to one value", () => {
    const hashes = new Set(
      ["UK0720190001234", "uk-07 2019 0001234", "UK07/2019/0001234"].map(hashLicenceNumber),
    );
    expect(hashes.size).toBe(1);
  });

  test("different licences do not collide", () => {
    expect(hashLicenceNumber("UK0720190001234")).not.toBe(hashLicenceNumber("UK0720190001235"));
  });
});

describe("redact", () => {
  test("a licence number is masked, because which licence is the audit question", () => {
    expect(redact({ dl_number: "UK0720190001234" })).toEqual({ dl_number: "UK07*******1234" });
  });

  test("everything else sensitive becomes [redacted], not dropped", () => {
    expect(
      redact({ dob: "1995-06-15", photo_link: "data:image/png;base64,AAAA", address: "x" }),
    ).toEqual({ dob: "[redacted]", photo_link: "[redacted]", address: "[redacted]" });
  });

  test("key casing and shape do not matter", () => {
    expect(redact({ DOB: "x", dateOfBirth: "y", photoUrl: "z" })).toEqual({
      DOB: "[redacted]",
      dateOfBirth: "[redacted]",
      photoUrl: "[redacted]",
    });
  });

  test("non-sensitive fields survive, including nested ones", () => {
    expect(redact({ status: "INVALID", details: { name: "ASHA", dob: "1995-06-15" } })).toEqual({
      status: "INVALID",
      details: { name: "ASHA", dob: "[redacted]" },
    });
  });

  test("arrays are walked", () => {
    expect(redact([{ dob: "x" }, { status: "ok" }])).toEqual([
      { dob: "[redacted]" },
      { status: "ok" },
    ]);
  });

  test("a self-referencing object does not hang the audit writer", () => {
    const loop: Record<string, unknown> = { status: "ok" };
    loop.self = loop;
    expect(() => JSON.stringify(redact(loop))).not.toThrow();
  });
});

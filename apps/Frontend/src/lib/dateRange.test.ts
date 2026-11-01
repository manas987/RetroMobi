import { describe, test, expect } from "bun:test";
import { formatDuration, nextSelection } from "./dateRange";

const d = (iso: string) => new Date(`${iso}T00:00:00`);

test("first click holds a pending check-in and commits nothing", () => {
  const r = nextSelection(null, { from: d("2026-11-10"), to: undefined });
  expect(r.pending).toEqual(d("2026-11-10"));
  expect(r.commit).toBeNull();
});

test("a later second click commits the range", () => {
  const r = nextSelection(d("2026-11-10"), { from: d("2026-11-10"), to: d("2026-11-14") });
  expect(r.pending).toBeNull();
  expect(r.commit).toEqual({ from: d("2026-11-10"), to: d("2026-11-14") });
});

// The original bug: a far-out end date silently moved the start.
test("an end date 30 days out does not move the start", () => {
  const r = nextSelection(d("2026-11-10"), { from: d("2026-11-10"), to: d("2026-12-10") });
  expect(r.commit).toEqual({ from: d("2026-11-10"), to: d("2026-12-10") });
  expect(r.pending).toBeNull();
});

test("same-day rental commits", () => {
  const r = nextSelection(d("2026-11-10"), { from: d("2026-11-10"), to: d("2026-11-10") });
  expect(r.commit).toEqual({ from: d("2026-11-10"), to: d("2026-11-10") });
});

test("clicking earlier than the pending check-in restarts there", () => {
  const r = nextSelection(d("2026-11-20"), { from: d("2026-11-05"), to: d("2026-11-20") });
  expect(r.pending).toEqual(d("2026-11-05"));
  expect(r.commit).toBeNull();
});

test("a cleared selection drops the pending check-in", () => {
  expect(nextSelection(d("2026-11-10"), undefined)).toEqual({ pending: null, commit: null });
});

describe("formatDuration", () => {
  const at = (d: number, h: number) => new Date(2026, 10, d, h, 0, 0, 0);

  test("under a day reads in hours", () => {
    expect(formatDuration(at(1, 10), at(1, 22))).toBe("12 hrs");
  });

  test("whole days drop the hour part", () => {
    expect(formatDuration(at(1, 10), at(3, 10))).toBe("2d");
  });

  test("a part day keeps the remainder", () => {
    expect(formatDuration(at(1, 10), at(3, 14))).toBe("2d 4h");
  });

  // A zero-length window would otherwise read "0 hrs", which looks like a bug
  // rather than a window the user has not finished choosing yet.
  test("never reports zero", () => {
    expect(formatDuration(at(1, 10), at(1, 10))).toBe("1 hrs");
  });
});

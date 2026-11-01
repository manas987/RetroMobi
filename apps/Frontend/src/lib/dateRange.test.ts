import { test, expect } from "bun:test";
import { nextSelection } from "./dateRange";

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

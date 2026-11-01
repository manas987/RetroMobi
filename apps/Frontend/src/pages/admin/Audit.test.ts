import { test, expect } from "bun:test";
import { diffRows } from "./Audit";

test("an update reports only the fields that moved", () => {
  const changes = diffRows(
    { code: "DIWALI", status: "ACTIVE", used_count: 0 },
    { code: "DIWALI", status: "PAUSED", used_count: 0 },
  );
  expect(changes).toEqual([{ key: "status", before: "ACTIVE", after: "PAUSED" }]);
});

test("a create has no before, so every field reads as appearing", () => {
  const changes = diffRows(null, { code: "DIWALI", status: "ACTIVE" });
  expect(changes).toEqual([
    { key: "code", before: undefined, after: "DIWALI" },
    { key: "status", before: undefined, after: "ACTIVE" },
  ]);
});

test("a delete has no after, so every field reads as disappearing", () => {
  const changes = diffRows({ code: "DIWALI" }, null);
  expect(changes).toEqual([{ key: "code", before: "DIWALI", after: undefined }]);
});

test("an event logged with no snapshot produces no rows rather than throwing", () => {
  expect(diffRows(null, null)).toEqual([]);
  expect(diffRows(undefined, undefined)).toEqual([]);
});

test("a nested value counts as changed only when it actually differs", () => {
  expect(diffRows({ meta: { a: 1 } }, { meta: { a: 1 } })).toEqual([]);
  expect(diffRows({ meta: { a: 1 } }, { meta: { a: 2 } })).toHaveLength(1);
});

test("a field added by an update is reported", () => {
  const changes = diffRows({ code: "X" }, { code: "X", note: "added" });
  expect(changes).toEqual([{ key: "note", before: undefined, after: "added" }]);
});

import { expect, test } from "bun:test";
import { searchPresentation } from "./searchPresentation";

const idle = { isError: false, isFetching: false, isPlaceholderData: false };

test("initial loading reserves six cards, including the initial city redirect", () => {
  expect(searchPresentation(idle)).toEqual({ loading: true, failed: false, skeletonCount: 6 });
  expect(searchPresentation({ ...idle, isFetching: true }).loading).toBe(true);
});

test("new searches hide retained results and preserve their card count", () => {
  const previous = { ...idle, data: { results: [1, 2, 3] }, isPlaceholderData: true };
  expect(searchPresentation({ ...previous, isFetching: true }))
    .toEqual({ loading: true, failed: false, skeletonCount: 3 });
  expect(searchPresentation(previous).loading).toBe(true);
});

test("same-search refresh keeps cards visible", () => {
  expect(searchPresentation({ ...idle, data: { results: [1] }, isFetching: true }).loading).toBe(false);
});

test("errors cannot present stale data as successful results; retry returns to loading", () => {
  const error = { ...idle, data: { results: [1] }, isError: true };
  expect(searchPresentation(error)).toEqual({ loading: false, failed: true, skeletonCount: 1 });
  expect(searchPresentation({ ...error, isFetching: true }).loading).toBe(true);
  expect(searchPresentation({ ...idle, isError: true }).failed).toBe(true);
});

test("zero results remain a completed search", () => {
  expect(searchPresentation({ ...idle, data: { results: [] } }).loading).toBe(false);
  expect(searchPresentation({ ...idle, data: { results: [] } }).failed).toBe(false);
});

import { expect, test } from "bun:test";
import { getLocation } from "./useGeolocation";

const position = { coords: { latitude: 30.3, longitude: 78.1 } } as GeolocationPosition;

test("unsupported and insecure contexts never ask for permission", async () => {
  let requests = 0;
  const geolocation = { getCurrentPosition() { requests++; } };
  expect(await getLocation({ geolocation }, false)).toEqual({ status: "unsupported", reason: "insecure" });
  expect(await getLocation({}, true)).toEqual({ status: "unsupported", reason: "unavailable" });
  expect(requests).toBe(0);
});

test("known denied permissions explain the block without prompting again", async () => {
  let requests = 0;
  const result = await getLocation({
    permissions: { query: async () => ({ state: "denied" }) as PermissionStatus },
    geolocation: { getCurrentPosition() { requests++; } },
  }, true);
  expect(result).toEqual({ status: "denied" });
  expect(requests).toBe(0);
});

test("granted access returns coordinates with the existing timeout and cache settings", async () => {
  let options: PositionOptions | undefined;
  const result = await getLocation({
    permissions: { query: async () => ({ state: "granted" }) as PermissionStatus },
    geolocation: { getCurrentPosition(success, _error, supplied) { options = supplied; success(position); } },
  }, true);
  expect(result).toEqual({ status: "granted", lat: 30.3, lng: 78.1 });
  expect(options).toEqual({ timeout: 8000, maximumAge: 300000 });
});

test("unsupported Permissions queries fall back to geolocation", async () => {
  const result = await getLocation({
    permissions: { query: async () => { throw new Error("not supported"); } },
    geolocation: { getCurrentPosition(success) { success(position); } },
  }, true);
  expect(result.status).toBe("granted");
});

test.each([
  [1, { status: "denied" }],
  [2, { status: "error", reason: "unavailable" }],
  [3, { status: "error", reason: "timeout" }],
] as const)("geolocation error %s retains the correct explanation", async (code, expected) => {
  const result = await getLocation({
    geolocation: { getCurrentPosition(_success, error) { error?.({ code } as GeolocationPositionError); } },
  }, true);
  expect(result).toEqual(expected);
});

test("a synchronous geolocation failure becomes a retryable error", async () => {
  expect(await getLocation({ geolocation: { getCurrentPosition() { throw new Error("failed"); } } }, true))
    .toEqual({ status: "error", reason: "unavailable" });
});

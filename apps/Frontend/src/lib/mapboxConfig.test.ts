import { expect, test } from "bun:test";
import { requirePublicMapboxToken } from "./mapboxConfig";

test("only explicitly public tokens can be bundled", () => {
  expect(requirePublicMapboxToken("pk.test-public-token")).toBe("pk.test-public-token");
  for (const value of [undefined, "", "sk.test-secret-token", "tk.test-temporary-token", "replace-me"]) {
    expect(() => requirePublicMapboxToken(value)).toThrow("public Mapbox (pk.) token");
  }
});

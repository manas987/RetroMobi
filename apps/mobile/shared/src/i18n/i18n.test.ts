import { describe, expect, test } from "bun:test";
import { translate } from "./index";

describe("translate", () => {
  test("fills placeholders and leaves unknown ones visible", () => {
    expect(translate("en", "overview.greeting", { name: "Ramesh" })).toBe("Namaste, Ramesh");
    expect(translate("hi", "overview.greeting", { name: "Ramesh" })).toBe("नमस्ते, Ramesh");
    expect(translate("en", "overview.greeting")).toBe("Namaste, {name}");
  });

  test("an unknown key falls back to the key itself rather than crashing", () => {
    expect(translate("hi", "status.stage_NOPE")).toBe("status.stage_NOPE");
  });
});

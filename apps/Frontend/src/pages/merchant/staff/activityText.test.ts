import { describe, expect, test } from "bun:test";
import { translate } from "../../../i18n";
import { activityText, type ActivityItem } from "./activityText";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
const base: ActivityItem = {
  id: "1", action: "", after: null, created_at: "2026-11-13T10:00:00Z", actor_type: "MERCHANT",
  actor_id: "m", actor_name: "Ravi", actor_role: "STAFF", booking_id: null, vehicle_id: "v",
  registration_number: "UK07 GH 5520", make: "Honda", model: "Activa", customer_name: null,
};

describe("activityText", () => {
  test("listing toggle picks on/off from the new status", () => {
    expect(activityText({ ...base, action: "vehicle.listing_changed", after: { status: "ACTIVE" } }, t)).toBe(
      "Ravi turned on UK07 GH 5520 on RetroMobi",
    );
  });
  test("a claim return says the deposit was kept", () => {
    expect(activityText({ ...base, action: "booking.returned", after: { claim: true } }, t)).toContain("deposit kept");
  });
  test("an admin decision is credited to RetroMobi", () => {
    const item = { ...base, action: "vehicle.verification_decided", actor_type: "ADMIN" as const, actor_name: null, after: { status: "VERIFIED" } };
    expect(activityText(item, t)).toBe("RetroMobi approved UK07 GH 5520");
  });
  test("an unknown action falls back", () => {
    expect(activityText({ ...base, action: "nope.nothing" }, t)).toBe("Ravi made a change");
  });
});

import { expect, test } from "bun:test";
import { pruneCart, type CartItem } from "./cart";

test("pruning clears selected vehicles and the pool used to increase quantity", () => {
  const line: CartItem = {
    modelId: "model", shopId: "shop", make: "Honda", model: "Activa", shopName: "Shop", pricePerDay: 50000,
    vehicleIds: ["a", "b"], availableVehicleIds: ["a", "b", "c", "d"],
  };
  expect(pruneCart([line], ["a", "c"])).toEqual([{ ...line, vehicleIds: ["b"], availableVehicleIds: ["b", "d"] }]);
  expect(pruneCart([line], ["a", "b"])).toEqual([]);
});

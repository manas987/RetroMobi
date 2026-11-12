import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CartLimitNotice, CartRemovedNotice } from "./CartDrawer";
import { CartProvider, MAX_CART_ITEMS, pruneCart, useCart, type CartItem } from "../lib/cart";

test("cart limit message is a compact timed notice with a cart action and no close button", () => {
  const html = renderToStaticMarkup(<CartLimitNotice onOpen={() => {}} onDismiss={() => {}} />);
  expect(html).toContain('role="status"');
  expect(html).toContain(String(MAX_CART_ITEMS));
  expect(html).toContain("Remove one to add another.");
  expect(html).toContain("Open cart");
  expect(html).toContain("cart-limit-toast");
  expect(html).toContain("Cart full");
  expect(html).not.toContain("Dismiss cart limit message");
  expect(html.match(/<button/g)).toHaveLength(1);
});

test("cart limit validation counts units across shops and still permits reductions", () => {
  const line = { modelId: "a", shopId: "shop-a", make: "Test", model: "A", shopName: "A", pricePerDay: 50000 };
  const other = { ...line, modelId: "b", shopId: "shop-b" };
  const items: CartItem[] = [
    { ...line, vehicleIds: ["a1", "a2", "a3"], availableVehicleIds: ["a1", "a2", "a3", "a4"] },
    { ...other, vehicleIds: ["b1", "b2"], availableVehicleIds: ["b1", "b2", "b3"] },
  ];
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => JSON.stringify(items) } });
  try {
    let cart!: ReturnType<typeof useCart>;
    function Capture() { cart = useCart(); return null; }
    renderToStaticMarkup(<CartProvider><Capture /></CartProvider>);
    expect(cart.totalUnits).toBe(5);
    expect(cart.setQty(line, 4, items[0]!.availableVehicleIds)).toBe("full");
    expect(cart.setQty({ ...line, modelId: "new" }, 1, ["new1"])).toBe("full");
    expect(cart.items).toEqual(items);
    expect(cart.setQty(line, 2, items[0]!.availableVehicleIds)).toBe("ok");
    expect(cart.setQty(line, 0, items[0]!.availableVehicleIds)).toBe("ok");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("the unavailable-item notice reads as one sentence and offers the cart", () => {
  const one = renderToStaticMarkup(<CartRemovedNotice count={1} onOpen={() => {}} onDismiss={() => {}} />);
  expect(one).toContain("1 item in your cart is no longer available");
  expect(one).toContain('role="status"');
  expect(one).toContain("Open cart");
  // Same chrome as the limit notice -- the two must not drift apart.
  expect(one).toContain("cart-limit-toast");

  const many = renderToStaticMarkup(<CartRemovedNotice count={3} onOpen={() => {}} onDismiss={() => {}} />);
  expect(many).toContain("3 items in your cart are no longer available");
});

test("pruning drops unavailable units from both the held ids and the refill pool", () => {
  const line = { modelId: "a", shopId: "shop-a", make: "Test", model: "A", shopName: "A", pricePerDay: 50000 };
  const other = { ...line, modelId: "b", shopId: "shop-b" };
  const items: CartItem[] = [
    { ...line, vehicleIds: ["a1", "a2"], availableVehicleIds: ["a1", "a2", "a3"] },
    { ...other, vehicleIds: ["b1"], availableVehicleIds: ["b1", "b2"] },
  ];

  // a3 is only in the pool, never held -- but setQty promotes straight out of the
  // pool without re-fetching, so leaving it there puts it back on the next bump.
  const pruned = pruneCart(items, ["a2", "a3"]);
  expect(pruned).toHaveLength(2);
  expect(pruned[0]!.vehicleIds).toEqual(["a1"]);
  expect(pruned[0]!.availableVehicleIds).toEqual(["a1"]);
  expect(pruned[1]).toEqual(items[1]!);

  // A line with nothing bookable left is gone, not an empty row.
  expect(pruneCart(items, ["b1"]).map((i) => i.modelId)).toEqual(["a"]);
  // Nothing unavailable is the common case, and must not churn the array.
  expect(pruneCart(items, [])).toBe(items);
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CartLimitNotice } from "./CartDrawer";
import { CartProvider, MAX_CART_ITEMS, useCart, type CartItem } from "../lib/cart";

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

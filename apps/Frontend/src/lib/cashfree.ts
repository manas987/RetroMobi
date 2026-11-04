import { load } from "@cashfreepayments/cashfree-js";

/**
 * Hand the customer over to Cashfree's hosted checkout.
 *
 * `mode` is not configured here: it comes back from the server with the payment
 * session, because the server is the only thing that knows which environment
 * the session was minted in. A sandbox session handed to the production SDK
 * fails in a way that looks like a code bug for an afternoon.
 *
 * `redirectTarget: "_self"` -- a full-page redirect, not `"_modal"`. UPI is the
 * dominant method in this market and a UPI intent has to hand off to a payment
 * app; a modal on the current page handles that app switch badly on mobile.
 * After payment, Cashfree returns the browser to the order's return_url, which
 * the backend set to /checkout/return?group=<groupId>.
 */
export async function startCheckout(args: {
  paymentSessionId: string;
  mode: "sandbox" | "production";
}): Promise<void> {
  const cashfree = await load({ mode: args.mode });
  await cashfree.checkout({
    paymentSessionId: args.paymentSessionId,
    redirectTarget: "_self",
  });
}

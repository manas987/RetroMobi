import { AppState } from "react-native";
import { ApiError } from "@retromobi/mobile-shared";
import type { PaymentIntent } from "./payment";

type Pending = { id: string; returned: () => void };
let pending: Pending | undefined;
let sdk: typeof import("react-native-cashfree-pg-sdk") | undefined;

export async function openPayment(intent: PaymentIntent, returned: () => void) {
  if (!intent || typeof intent.orderId !== "string" || !intent.orderId || typeof intent.paymentSessionId !== "string" ||
    !intent.paymentSessionId || (intent.mode !== "production" && intent.mode !== "sandbox")) {
    throw new Error("Couldn't read this payment session. Check your booking before trying again.");
  }

  // The server's development provider settles these via the same status endpoint.
  if (intent.paymentSessionId.startsWith("fake_session_")) { returned(); return; }

  const { CFSession, CFEnvironment } = await import("cashfree-pg-api-contract");
  if (!sdk) {
    const native = await import("react-native-cashfree-pg-sdk");
    const finish = (orderId: string) => {
      if (pending?.id !== orderId) return;
      const done = pending.returned;
      pending = undefined;
      done();
    };
    native.CFPaymentGatewayService.setCallback({ onVerify: finish, onError: (_, id) => finish(id) });
    sdk = native;
  }
  pending = { id: intent.orderId, returned };
  try {
    sdk.CFPaymentGatewayService.doWebPayment(new CFSession(intent.paymentSessionId, intent.orderId,
      intent.mode === "production" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX));
  } catch (err) {
    pending = undefined;
    throw err;
  }
}

export async function checkPayment<T>(read: () => Promise<T>, settled: (data: T) => boolean, active: () => boolean) {
  let interval = 2000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, interval));
    if (!active() || AppState.currentState === "background") return;
    interval = 2000;
    try {
      if (settled(await read())) return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 429) throw err;
      interval = Math.max(2000, (err.retryAfterSeconds ?? 60) * 1000);
    }
  }
}

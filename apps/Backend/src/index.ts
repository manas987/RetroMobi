import express from "express";
import { errorHandler } from "./middleware/errorHandler.ts";
import adminRoutes from "./Routes/admin/index.ts";
import merchantRoutes from "./Routes/merchant/index.ts";
import userRoutes from "./Routes/user/index.ts";

// The app only. Listening and the background sweep live in the root `index.ts`,
// per backend.md Layer 3 -- both this file and that one were calling app.listen()
// on the same port, so `bun run dev` bound twice. Keeping the app side-effect-free
// also means importing it (from a route-level test, say) starts no timers.
export const app = express();
app.disable("x-powered-by");
// The frontend server proxies /api from the same host and overwrites
// X-Forwarded-For with the real client address. Without trusting it, req.ip is
// the proxy for every request and the per-IP rate limiter puts all users in one
// bucket. Loopback only, so a client can't spoof its IP from outside.
// ponytail: assumes the proxy runs on the same host; set the proxy's address
// here if it moves to its own machine.
app.set("trust proxy", "loopback");

// Mounted ahead of the JSON parser so the Cashfree signature check in
// Payments/controller.ts runs against the exact bytes Cashfree signed.
app.use("/api/user/payments/webhook", express.raw({ type: "*/*" }));
// The payouts product's own webhook, same reason: the signature is over the
// exact bytes, so this route cannot go through the JSON parser either.
app.use("/api/merchant/payouts/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use("/api/user", userRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/admin", adminRoutes);
app.use(errorHandler);

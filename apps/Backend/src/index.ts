import express from "express";
import { pool } from "./DB/client.ts";
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

// req.ip feeds the per-ip rate limiter. Without this it is the proxy's address,
// so every user shared one bucket. Only a proxy on loopback or a private network
// (the Bun dev proxy, nginx reaching the container through Docker) is trusted to
// set X-Forwarded-For; a client hitting the port directly cannot spoof it.
app.set("trust proxy", "loopback, uniquelocal");

// Mounted ahead of the JSON parser so the Cashfree signature check in
// Payments/controller.ts runs against the exact bytes Cashfree signed.
app.use("/api/user/payments/webhook", express.raw({ type: "*/*" }));
// The payouts product's own webhook, same reason: the signature is over the
// exact bytes, so this route cannot go through the JSON parser either.
app.use("/api/merchant/payouts/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
// For deploy.sh and uptime checks: up AND able to reach the database.
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.use("/api/user", userRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/admin", adminRoutes);
app.use(errorHandler);

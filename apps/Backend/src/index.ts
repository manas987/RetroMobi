import express from "express";
import { errorHandler } from "./middleware/errorHandler.ts";
import userRoutes from "./Routes/user/index.ts";

// The app only. Listening and the background sweep live in the root `index.ts`,
// per backend.md Layer 3 -- both this file and that one were calling app.listen()
// on the same port, so `bun run dev` bound twice. Keeping the app side-effect-free
// also means importing it (from a route-level test, say) starts no timers.
export const app = express();

// Mounted ahead of the JSON parser so the Cashfree signature check in
// Payments/controller.ts runs against the exact bytes Cashfree signed.
app.use("/api/user/payments/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use("/api/user", userRoutes);
app.use(errorHandler);

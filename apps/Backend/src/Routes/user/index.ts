import { Router } from "express";
import authRoutes from "./Auth/routes.ts";
import bookingsRoutes from "./Bookings/routes.ts";
import paymentsRoutes from "./Payments/routes.ts";
import pickupRoutes from "./Pickup/routes.ts";
import ridersRoutes from "./Riders/routes.ts";
import reviewsRoutes from "./Reviews/routes.ts";
import searchRoutes from "./Search/routes.ts";
import ticketsRoutes from "./Tickets/routes.ts";

const router = Router();

router.use("/auth", authRoutes);
router.use("/search", searchRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/bookings", pickupRoutes);
router.use("/payments", paymentsRoutes);
router.use("/riders", ridersRoutes);
router.use("/tickets", ticketsRoutes);
router.use(reviewsRoutes);

export default router;

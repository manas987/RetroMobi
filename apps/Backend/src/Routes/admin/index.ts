import { Router } from "express";
import adminsRoutes from "./Admins/routes.ts";
import authRoutes from "./Auth/routes.ts";
import couponsRoutes from "./Coupons/routes.ts";
import licenceVehiclesRoutes from "./LicenceVehicles/routes.ts";
import modelsRoutes from "./Models/routes.ts";
import oversightRoutes from "./Oversight/routes.ts";
import ticketsRoutes from "./Tickets/routes.ts";
import verificationRoutes from "./Verification/routes.ts";

const router = Router();

router.use("/auth", authRoutes);
router.use("/admins", adminsRoutes);
router.use("/verification", verificationRoutes);
router.use(licenceVehiclesRoutes);
router.use("/models", modelsRoutes);
router.use("/coupons", couponsRoutes);
router.use("/tickets", ticketsRoutes);
router.use(oversightRoutes);

export default router;

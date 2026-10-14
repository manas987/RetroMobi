import { Router } from "express";
import authRoutes from "./Auth/routes.ts";
import fleetRoutes from "./Fleet/routes.ts";
import licencesRoutes from "./Licences/routes.ts";
import membersRoutes from "./Members/routes.ts";
import operationsRoutes from "./Operations/routes.ts";
import payoutsRoutes from "./Payouts/routes.ts";
import pricingRoutes from "./Pricing/routes.ts";
import shopsRoutes from "./Shops/routes.ts";
import ticketsRoutes from "./Tickets/routes.ts";

const router = Router();

router.use("/auth", authRoutes);
router.use("/shops", shopsRoutes);
router.use(membersRoutes);
router.use(licencesRoutes);
router.use(fleetRoutes);
router.use(pricingRoutes);
router.use(operationsRoutes);
router.use(payoutsRoutes);
router.use("/tickets", ticketsRoutes);

export default router;

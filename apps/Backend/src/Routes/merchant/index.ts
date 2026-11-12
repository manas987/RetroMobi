import { Router } from "express";
import authRoutes from "./Auth/routes.ts";
import { me } from "./Auth/controller.ts";
import { requireMerchantAuth } from "../../middleware/requireMerchantAuth.ts";
import fleetRoutes from "./Fleet/routes.ts";
import licencesRoutes from "./Licences/routes.ts";
import membersRoutes from "./Members/routes.ts";
import modelsRoutes from "./Models/routes.ts";
import operationsRoutes from "./Operations/routes.ts";
import payoutsRoutes from "./Payouts/routes.ts";
import pricingRoutes from "./Pricing/routes.ts";
import reportsRoutes from "./Reports/routes.ts";
import setupRoutes from "./Setup/routes.ts";
import shopsRoutes from "./Shops/routes.ts";
import ticketsRoutes from "./Tickets/routes.ts";

const router = Router();

router.use("/auth", authRoutes);
// Not under /auth: the client deliberately skips its token-refresh retry for
// /auth/* paths, and this is an ordinary authenticated read.
router.get("/me", requireMerchantAuth, me);
router.use("/shops", shopsRoutes);
router.use("/models", modelsRoutes);
router.use(membersRoutes);
router.use(licencesRoutes);
router.use(fleetRoutes);
router.use(pricingRoutes);
router.use(operationsRoutes);
router.use(payoutsRoutes);
router.use(reportsRoutes);
router.use(setupRoutes);
router.use("/tickets", ticketsRoutes);

export default router;

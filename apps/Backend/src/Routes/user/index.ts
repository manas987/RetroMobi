import { Router } from "express";
import authRoutes from "./Auth/routes.ts";

const router = Router();

router.use("/auth", authRoutes);

export default router;

import { Router } from "express";
import { rateLimit } from "../../../middleware/rateLimit.ts";
import * as controller from "./controller.ts";

const router = Router();

// Public, like search and shop reviews — a rider compares shops before
// anything knows who they are, so this gets the same rate limit rather than
// an auth check.
router.get("/:shopId", rateLimit, controller.profile);

export default router;

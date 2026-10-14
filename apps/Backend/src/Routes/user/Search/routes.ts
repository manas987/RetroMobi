import { Router } from "express";
import { rateLimit } from "../../../middleware/rateLimit.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { SearchQuerySchema } from "./schema.ts";

const router = Router();

router.get("/", rateLimit, validate(SearchQuerySchema, "query"), controller.search);
router.get("/vehicle/:vehicleId", rateLimit, controller.detail);

export default router;

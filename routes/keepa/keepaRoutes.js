import { Router } from "express";
import { keepaController } from "../../controllers/keepa/keepaController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireApproved } from "../../middlewares/requireApproved.js";

const router = Router();

router.use(requireAuth, requireApproved);

router.post("/product", keepaController.fetchProduct);
router.get("/graph",    keepaController.graph);

export default router;

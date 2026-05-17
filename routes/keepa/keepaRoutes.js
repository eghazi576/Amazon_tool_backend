import { Router } from "express";
import { keepaController } from "../../controllers/keepa/keepaController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

router.post("/product", requireAuth, keepaController.fetchProduct);

export default router;

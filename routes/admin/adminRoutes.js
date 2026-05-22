import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { adminController } from "../../controllers/admin/adminController.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats",           adminController.getStats);
router.get("/searches",        adminController.getAllSearches);
router.get("/scoring-config",  adminController.getScoringConfig);
router.put("/scoring-config",  adminController.saveScoringConfig);
router.post("/scoring-config/reset", adminController.resetScoringConfig);

export default router;

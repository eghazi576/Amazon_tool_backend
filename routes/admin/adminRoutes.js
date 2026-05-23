import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { adminController } from "../../controllers/admin/adminController.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats",                      adminController.getStats);
router.get("/searches",                   adminController.getAllSearches);
router.get("/scoring-config",             adminController.getScoringConfig);
router.put("/scoring-config",             adminController.saveScoringConfig);
router.post("/scoring-config/reset",      adminController.resetScoringConfig);
router.get("/brand-scoring-config",       adminController.getBrandScoringConfig);
router.put("/brand-scoring-config",       adminController.saveBrandScoringConfig);
router.post("/brand-scoring-config/reset",adminController.resetBrandScoringConfig);
router.get("/brand-searches",             adminController.getAllBrandSearches);

export default router;

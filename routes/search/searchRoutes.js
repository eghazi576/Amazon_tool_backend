import { Router } from "express";
import { searchController } from "../../controllers/search/searchController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

// All search routes require authentication
router.use(requireAuth);

router.post("/save",       searchController.save);
router.get("/history",     searchController.history);
router.delete("/clear/all", searchController.clearAll);
router.delete("/:id",      searchController.deleteOne);

export default router;

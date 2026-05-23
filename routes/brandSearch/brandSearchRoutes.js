import { Router } from "express";
import { brandSearchController } from "../../controllers/brandSearch/brandSearchController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.post(  "/",         brandSearchController.save);
router.get(   "/",         brandSearchController.getHistory);
router.delete("/",         brandSearchController.deleteAll);
router.delete("/:id",      brandSearchController.deleteOne);

export default router;

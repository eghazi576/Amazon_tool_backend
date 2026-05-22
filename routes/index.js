import { Router } from "express";
import authRoutes   from "./auth/authRoutes.js";
import searchRoutes from "./search/searchRoutes.js";
import keepaRoutes  from "./keepa/keepaRoutes.js";
import adminRoutes  from "./admin/adminRoutes.js";

const router = Router();

router.use("/auth",   authRoutes);
router.use("/search", searchRoutes);
router.use("/keepa",  keepaRoutes);
router.use("/admin",  adminRoutes);

export default router;

// ─── Environment must load first ─────────────────────────────────────────────
import "./config/env.js";
import { env } from "./config/env.js";

import express     from "express";
import cors        from "cors";
import rateLimit   from "express-rate-limit";
import routes      from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { sendSuccess, sendError } from "./utils/response.js";
import prisma      from "./db/prisma.js";

const app = express();

// Trust Nginx reverse proxy
app.set("trust proxy", 1);

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin:       env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(","),
  methods:      ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later.", code: "RATE_LIMITED" },
});

const keepaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many Keepa requests, please slow down.", code: "RATE_LIMITED" },
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(res, { status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    return sendError(res, "Database not connected", 503, "DB_ERROR");
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",  authLimiter);
app.use("/api/keepa", keepaLimiter);
app.use("/api", routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  return sendError(res, `Route ${req.method} ${req.path} not found`, 404, "NOT_FOUND");
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`\n✅  Amazon Insight Hub backend running`);
  console.log(`   Port:          ${env.PORT}`);
  console.log(`   Environment:   ${env.NODE_ENV}`);
  console.log(`   KEEPA_API_KEY: ${env.KEEPA_API_KEY ? "✓ set" : "✗ NOT SET"}`);
  console.log(`   DATABASE_URL:  ${env.DATABASE_URL ? "✓ set" : "✗ NOT SET"}\n`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on("SIGINT",  async () => { await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await prisma.$disconnect(); process.exit(0); });

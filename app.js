// ─── Environment must load first ─────────────────────────────────────────────
import "./config/env.js";
import { env } from "./config/env.js";

import express      from "express";
import cors         from "cors";
import helmet       from "helmet";
import rateLimit    from "express-rate-limit";
import cookieParser from "cookie-parser";
import routes      from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { sendSuccess, sendError } from "./utils/response.js";
import prisma      from "./db/prisma.js";

const app = express();

// Trust 2 hops: Cloudflare (external) + Nginx (local)
// This makes req.ip = real client IP instead of Cloudflare edge IP
app.set("trust proxy", 2);

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // API-only backend — no HTML served
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin:       env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(","),
  methods:      ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials:  true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const RL_BASE = { standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } };
const rlMsg   = (msg) => ({ success: false, error: msg, code: "RATE_LIMITED" });

const authLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: rlMsg("Too many requests, please try again later."),
});

const keepaLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 1000,
  max: 30,
  message: rlMsg("Too many Keepa requests, please slow down."),
});

const searchLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 1000,
  max: 60,
  message: rlMsg("Too many requests, please slow down."),
});

const brandLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 1000,
  max: 40,
  message: rlMsg("Too many brand requests, please slow down."),
});

const adminLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 1000,
  max: 60,
  message: rlMsg("Too many admin requests, please slow down."),
});

// ─── Health Check (internal use only) ────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(res, { status: "ok" });
  } catch {
    return sendError(res, "Service unavailable", 503, "DB_ERROR");
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",         authLimiter);
app.use("/api/keepa",        keepaLimiter);
app.use("/api/search",       searchLimiter);
app.use("/api/brand-history", brandLimiter);
app.use("/api/admin",        adminLimiter);
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

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
import { requestId }    from "./middlewares/requestId.js";
import { sendSuccess, sendError } from "./utils/response.js";
import prisma      from "./db/prisma.js";

const app = express();
const isProd = env.NODE_ENV === "production";

// Trust 2 hops: Cloudflare (external) + Nginx (local)
// This makes req.ip = real client IP instead of Cloudflare edge IP
app.set("trust proxy", 2);

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(requestId);   // first: every later log line and error can carry req.id
app.use(helmet({
  // No CSP here: this process serves JSON, never HTML. The CSP that matters is
  // on the pages themselves, and those are served by nginx -- see
  // nginx.conf.example, where the header is now set.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // DENY, not SAMEORIGIN. Nothing here should ever render in a frame.
  frameguard: { action: "deny" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// CORS with credentials:true and origin:"*" is rejected by every browser anyway,
// but an operator could still set CORS_ORIGIN=* and quietly disable the check for
// non-browser callers. Refuse to start rather than run wide open in production.
if (isProd && env.CORS_ORIGIN.trim() === "*") {
  console.error("❌  CORS_ORIGIN must not be '*' in production. Set it to the site's origin.");
  process.exit(1);
}

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

// Broad bucket for the whole /api/auth surface -- refresh, logout, /me. These
// fire often in normal use, so this stays generous.
const authLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: rlMsg("Too many requests, please try again later."),
});

// Credential guessing gets its own, much tighter bucket. The broad limiter above
// let an attacker spend all 20 attempts in the window on password guesses; login
// and register now cap out long before that.
const loginLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // a legitimate user who signs in is not "attempts"
  message: rlMsg("Too many sign-in attempts. Wait a minute and try again."),
});

// Password reset is the highest-value target: it emails a token that changes the
// password. It also has no legitimate reason to be called repeatedly.
const passwordResetLimiter = rateLimit({
  ...RL_BASE,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: rlMsg("Too many password reset requests. Try again in an hour."),
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
// Order matters: the specific paths must be registered before the broad
// /api/auth bucket, or the loose limit is the only one that ever runs.
app.use("/api/auth/login",           loginLimiter);
app.use("/api/auth/register",        loginLimiter);
app.use("/api/auth/forgot-password", passwordResetLimiter);
app.use("/api/auth/reset-password",  passwordResetLimiter);
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
//
// Bind to loopback only. nginx runs on the same host and proxies to
// http://localhost:3001, so it can still reach the app -- but the internet
// cannot. Before this, app.listen(PORT) bound 0.0.0.0, and the Node process was
// directly reachable on the public IP at :3001.
//
// That was not theoretical. A request to http://<ip>:3001 sailed straight past
// Cloudflare and nginx -- no WAF, no TLS, no edge rate limiting -- and because
// trust proxy makes the limiter read X-Forwarded-For, an attacker could set that
// header themselves and give every request a fresh "IP", making the login
// rate limit count nothing. Demonstrated: 10 password guesses, 10 allowed.
//
// Binding to 127.0.0.1 closes that path at the application, independent of the
// host firewall. In development, localhost is exactly what you connect to anyway.
const HOST = "127.0.0.1";
app.listen(env.PORT, HOST, () => {
  console.log(`\n✅  Amazon Insight Hub backend running`);
  console.log(`   Address:       ${HOST}:${env.PORT} (loopback only, behind nginx)`);
  console.log(`   Environment:   ${env.NODE_ENV}`);
  console.log(`   KEEPA_API_KEY: ${env.KEEPA_API_KEY ? "✓ set" : "✗ NOT SET"}`);
  console.log(`   DATABASE_URL:  ${env.DATABASE_URL ? "✓ set" : "✗ NOT SET"}\n`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on("SIGINT",  async () => { await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await prisma.$disconnect(); process.exit(0); });

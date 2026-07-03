import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  PORT:            z.string().default("3001"),
  NODE_ENV:        z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN:     z.string().min(1, "CORS_ORIGIN must be set (e.g. https://thewholesaleos.com)"),
  DATABASE_URL:    z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET:      z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN:  z.string().default("7d"),
  KEEPA_API_KEY:   z.string().min(1, "KEEPA_API_KEY is required"),
  ADMIN_EMAILS:    z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  parsed.error.issues.forEach((issue) => {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

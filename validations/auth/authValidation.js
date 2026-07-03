import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .max(255, "Email too long")
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long"),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .max(255, "Email too long")
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required")
    .max(72, "Password too long"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address")
    .toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string({ required_error: "Token is required" }).min(1, "Token is required"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters"),
});

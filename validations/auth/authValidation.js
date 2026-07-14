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

/**
 * Deleting an account requires the current password, not just a session cookie.
 * A stolen session, or an unlocked laptop, should not be enough to destroy
 * someone's data.
 */
export const deleteAccountSchema = z.object({
  password: z
    .string({ required_error: "Password is required to delete your account" })
    .min(1, "Password is required to delete your account")
    .max(72, "Password too long"),
});

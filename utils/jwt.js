import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./response.js";

/**
 * Sign a JWT token.
 * @param {object} payload
 * @returns {string}
 */
export const signToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

/**
 * Verify a JWT token.
 * @param {string} token
 * @returns {object} decoded payload
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Token has expired", 401, "TOKEN_EXPIRED");
    }
    throw new AppError("Invalid token", 401, "INVALID_TOKEN");
  }
};

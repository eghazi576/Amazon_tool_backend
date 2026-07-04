import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./response.js";

export const signToken = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, {
    algorithm:  "HS256",
    expiresIn:  env.JWT_EXPIRES_IN,
  });

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    if (err.name === "TokenExpiredError")
      throw new AppError("Token has expired", 401, "TOKEN_EXPIRED");
    throw new AppError("Invalid token", 401, "INVALID_TOKEN");
  }
};

export const signRefreshToken = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
  }
};

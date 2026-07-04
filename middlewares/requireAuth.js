import { verifyToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";

export const requireAuth = (req, res, next) => {
  try {
    // Cookie-first, fall back to Authorization header
    let token = req.cookies?.access_token;

    if (!token) {
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) token = header.slice(7);
    }

    if (!token) return sendError(res, "Missing Authorization header", 401, "UNAUTHORIZED");

    const payload = verifyToken(token);
    req.userId    = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    next(err);
  }
};

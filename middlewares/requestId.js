import { randomUUID } from "crypto";

/**
 * Give every request an ID, echo it to the client, and keep it for the logs.
 *
 * The client only ever sees "Internal server error" -- deliberately, so nothing
 * about the query, the file paths or the database shape leaks out. That is the
 * right call, and it also makes a support ticket useless: "it broke" with no way
 * to find the matching line in a log with thousands of them.
 *
 * The correlation ID bridges that. The user reports the ID, and it is the key
 * into the server-side log entry that has the real detail.
 */
export const requestId = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};

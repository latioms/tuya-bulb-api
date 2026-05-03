import type { VercelResponse } from "@vercel/node";

/**
 * Centralized HTTP error response helpers.
 * Use these instead of inline `res.status(...).json(...)` calls in handlers
 * to ensure a consistent error shape across the entire API.
 *
 * All error responses follow the shape: `{ error: string, ...extra? }`
 */
export const Errors = {
  /** 400 — malformed request body or invalid field value. */
  badRequest(res: VercelResponse, message: string, extra?: object) {
    return res.status(400).json({ error: message, ...extra });
  },

  /** 401 — missing or invalid API key (handled by withAuth, exposed here for completeness). */
  unauthorized(res: VercelResponse) {
    return res.status(401).json({ error: "Unauthorized — missing or invalid x-api-key header" });
  },

  /** 405 — wrong HTTP method for this endpoint. */
  methodNotAllowed(res: VercelResponse) {
    return res.status(405).json({ error: "Method not allowed" });
  },

  /** 500 — unexpected server or Tuya API error. */
  serverError(res: VercelResponse, err: unknown) {
    return res.status(500).json({ error: String(err) });
  },
};

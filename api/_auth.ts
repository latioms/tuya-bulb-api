import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

/**
 * Higher-order function that wraps a Vercel handler with API key authentication.
 *
 * Reads the expected key from the `API_KEY` environment variable and compares it
 * to the `x-api-key` request header. Responds with 401 if missing or invalid.
 *
 * @example
 * export default withAuth(async (req, res) => { ... });
 */
export function withAuth(handler: Handler): Handler {
  return async (req, res) => {
    const expected = process.env.API_KEY;
    if (!expected) {
      return res.status(500).json({ error: "API_KEY env var is not configured on the server" });
    }
    const provided = req.headers["x-api-key"];
    if (!provided || provided !== expected) {
      return res.status(401).json({ error: "Unauthorized — missing or invalid x-api-key header" });
    }
    return handler(req, res);
  };
}

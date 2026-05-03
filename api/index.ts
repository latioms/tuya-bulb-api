import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PRESETS } from "./_presets";

/** GET /api — health check and route map. Does not require authentication. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "online",
    auth:   "All routes require the `x-api-key` header (except this one).",
    routes: {
      "GET  /api/status":      "Returns all device DP codes and their current values",
      "POST /api/power":       "{ on: boolean } — turn the bulb on or off",
      "POST /api/brightness":  "{ value: 10–1000 } — set brightness (white mode)",
      "POST /api/temperature": "{ value: 0–1000 } — set color temperature (0 warm, 1000 cool)",
      "POST /api/color":       "{ color: preset | { h, s, v } } — set colour mode",
      "POST /api/flash":       "{ color, times?, seconds?, duration? } — flash then restore",
    },
    presets: Object.keys(PRESETS),
  });
}

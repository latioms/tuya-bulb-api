import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "online",
    routes: {
      "GET  /api/status": "Get bulb status",
      "POST /api/power": "{ on: boolean }",
      "POST /api/brightness": "{ value: 10–1000 }",
      "POST /api/color": "{ h: 0–360, s: 0–1000, v: 0–1000 }",
      "POST /api/temperature": "{ value: 0 (warm) – 1000 (cool) }",
    },
  });
}

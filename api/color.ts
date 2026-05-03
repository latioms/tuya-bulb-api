import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { parseBody } from "./_body";

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body: { h?: unknown; s?: unknown; v?: unknown };
  try {
    body = await parseBody<{ h?: unknown; s?: unknown; v?: unknown }>(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  const h = Number(body?.h);
  const s = Number(body?.s);
  const v = Number(body?.v);
  if (
    !Number.isFinite(h) || h < 0 || h > 360 ||
    !Number.isFinite(s) || s < 0 || s > 1000 ||
    !Number.isFinite(v) || v < 0 || v > 1000
  ) {
    return res.status(400).json({ error: "h: 0–360, s: 0–1000, v: 0–1000" });
  }
  try {
    const result = await sendCommands([
      { code: "work_mode", value: "colour" },
      { code: "colour_data_v2", value: { h, s, v } },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}


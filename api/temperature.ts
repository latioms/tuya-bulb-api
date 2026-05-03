import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { parseBody } from "./_body";

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body: { value?: unknown };
  try {
    body = await parseBody<{ value?: unknown }>(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  const value = Number(body?.value);
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    return res.status(400).json({
      error: "`value` must be an integer between 0 (warm white) and 1000 (cool white)",
    });
  }
  try {
    const result = await sendCommands([
      { code: "work_mode", value: "white" },
      { code: "temp_value_v2", value },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}


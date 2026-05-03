import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body: { on?: unknown };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (typeof body?.on !== "boolean") {
    return res.status(400).json({ error: "`on` must be a boolean" });
  }
  try {
    const result = await sendCommands([{ code: "switch_led", value: body.on }]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { resolveColor, PRESETS } from "./_presets";
import { parseBody } from "./_body";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";

export const config = { api: { bodyParser: false } };

/**
 * POST /api/color — switches the bulb to colour mode and sets the colour.
 *
 * Body (one of):
 * - `{ "color": "red" }` — use a named preset
 * - `{ "h": 240, "s": 1000, "v": 1000 }` — raw HSV (h: 0–360, s/v: 0–1000)
 */
export default withAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return Errors.methodNotAllowed(res);

  let body: Record<string, unknown>;
  try {
    body = await parseBody<Record<string, unknown>>(req);
  } catch {
    return Errors.badRequest(res, "Invalid JSON body");
  }

  const color = resolveColor(body.color ?? body);
  if (!color) {
    return Errors.badRequest(res, "Provide `color` as a preset name or `{ h, s, v }` object", {
      presets: Object.keys(PRESETS),
    });
  }

  try {
    const result = await sendCommands([
      { code: "work_mode",      value: "colour" },
      { code: "colour_data_v2", value: color },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return Errors.serverError(res, err);
  }
});


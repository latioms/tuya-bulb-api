import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { parseBody } from "./_body";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";

export const config = { api: { bodyParser: false } };

/** POST /api/temperature — sets white color temperature. Body: `{ value: 0 (warm) – 1000 (cool) }` */
export default withAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return Errors.methodNotAllowed(res);

  let body: { value?: unknown };
  try {
    body = await parseBody<{ value?: unknown }>(req);
  } catch {
    return Errors.badRequest(res, "Invalid JSON body");
  }

  const value = Number(body?.value);
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    return Errors.badRequest(res, "`value` must be an integer between 0 (warm white) and 1000 (cool white)");
  }

  try {
    const result = await sendCommands([
      { code: "work_mode",     value: "white" },
      { code: "temp_value_v2", value },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return Errors.serverError(res, err);
  }
});

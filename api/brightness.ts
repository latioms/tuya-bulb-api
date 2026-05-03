import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { parseBody } from "./_body";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";

export const config = { api: { bodyParser: false } };

/** POST /api/brightness — sets brightness. Body: `{ value: 10–1000 }` */
export default withAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return Errors.methodNotAllowed(res);

  let body: { value?: unknown };
  try {
    body = await parseBody<{ value?: unknown }>(req);
  } catch {
    return Errors.badRequest(res, "Invalid JSON body");
  }

  const value = Number(body?.value);
  if (!Number.isInteger(value) || value < 10 || value > 1000) {
    return Errors.badRequest(res, "`value` must be an integer between 10 and 1000");
  }

  try {
    const result = await sendCommands([
      { code: "work_mode",       value: "white" },
      { code: "bright_value_v2", value },
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return Errors.serverError(res, err);
  }
});

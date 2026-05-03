import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendCommands } from "./_tuya";
import { parseBody } from "./_body";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";

export const config = { api: { bodyParser: false } };

/** POST /api/power — turns the bulb on or off. Body: `{ on: boolean }` */
export default withAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return Errors.methodNotAllowed(res);

  let body: { on?: unknown };
  try {
    body = await parseBody<{ on?: unknown }>(req);
  } catch {
    return Errors.badRequest(res, "Invalid JSON body");
  }

  if (typeof body?.on !== "boolean") {
    return Errors.badRequest(res, "`on` must be a boolean");
  }

  try {
    const result = await sendCommands([{ code: "switch_led", value: body.on }]);
    return res.status(200).json(result);
  } catch (err) {
    return Errors.serverError(res, err);
  }
});


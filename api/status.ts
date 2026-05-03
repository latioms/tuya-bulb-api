import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDeviceStatus } from "./_tuya";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";

/** GET /api/status — returns all DP codes and their current values. */
export default withAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return Errors.methodNotAllowed(res);
  try {
    const status = await getDeviceStatus();
    return res.status(200).json(status);
  } catch (err) {
    return Errors.serverError(res, err);
  }
});

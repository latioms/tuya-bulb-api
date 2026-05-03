import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDeviceStatus, sendCommands } from "./_tuya";
import { resolveColor, PRESETS } from "./_presets";
import { parseBody } from "./_body";
import { withAuth } from "./_auth";
import { Errors } from "./_errors";
import type { TuyaStatusItem, BulbSnapshot } from "./_types";

export const config = { api: { bodyParser: false } };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MAX_FLASH_SECONDS  = 300;
const DEFAULT_DURATION_MS = 1000;

/**
 * POST /api/flash — flashes the bulb in a color N times (or for S seconds),
 * then restores the original state.
 *
 * Body:
 * ```json
 * {
 *   "color":    "red",   // preset name or { h, s, v }
 *   "times":    3,       // number of flashes (default: 3, max: 20)
 *   "seconds":  10,      // OR total duration in seconds (max: 300) — overrides `times`
 *   "duration": 1000     // ms per half-blink, i.e. on+off = duration×2 (default: 1000)
 * }
 * ```
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

  const duration = typeof body.duration === "number"
    ? Math.min(Math.max(body.duration, 200), 2000)
    : DEFAULT_DURATION_MS;

  // `seconds` mode: derive times from total desired duration (capped at MAX_FLASH_SECONDS)
  // `times` mode: explicit count (default 3, max 20)
  let times: number;
  if (typeof body.seconds === "number") {
    const capped = Math.min(Math.max(body.seconds, 1), MAX_FLASH_SECONDS);
    times = Math.max(1, Math.floor((capped * 1000) / (duration * 2)));
  } else {
    times = typeof body.times === "number"
      ? Math.min(Math.max(Math.round(body.times), 1), 20)
      : 3;
  }

  // --- Snapshot current state ---
  const statusItems = await getDeviceStatus() as TuyaStatusItem[];
  const get = (code: string) => statusItems.find((s) => s.code === code)?.value;

  const snapshot: BulbSnapshot = {
    on:          get("switch_led") as boolean,
    mode:        get("work_mode") as string,
    brightness:  get("bright_value_v2") as number,
    temperature: get("temp_value_v2") as number,
    colour:      get("colour_data_v2"),
  };

  try {
    // If the bulb is off, turn it on before flashing so commands are received
    if (!snapshot.on) {
      await sendCommands([{ code: "switch_led", value: true }]);
      await sleep(500); // brief settle time
    }

    // --- Flash loop ---
    for (let i = 0; i < times; i++) {
      await sendCommands([
        { code: "work_mode",      value: "colour" },
        { code: "colour_data_v2", value: color },
      ]);
      await sleep(duration);
      await sendCommands([{ code: "bright_value_v2", value: 10 }]);
      await sleep(duration);
    }

    // --- Restore original state ---
    if (!snapshot.on) {
      await sendCommands([{ code: "switch_led", value: false }]);
    } else if (snapshot.mode === "colour") {
      const origColour = typeof snapshot.colour === "string"
        ? JSON.parse(snapshot.colour)
        : snapshot.colour;
      await sendCommands([
        { code: "work_mode",      value: "colour" },
        { code: "colour_data_v2", value: origColour },
      ]);
    } else {
      await sendCommands([
        { code: "work_mode",       value: "white" },
        { code: "bright_value_v2", value: snapshot.brightness },
        { code: "temp_value_v2",   value: snapshot.temperature },
      ]);
    }

    return res.status(200).json({ ok: true, flashed: times, duration, color });
  } catch (err) {
    return Errors.serverError(res, err);
  }
});

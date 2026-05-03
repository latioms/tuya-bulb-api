/** HSV color value as used by the Tuya `colour_data_v2` DP code. */
export interface HSV { h: number; s: number; v: number }

/**
 * Named color presets.
 * Values use Tuya's scale: h = 0–360, s = 0–1000, v = 0–1000.
 */
export const PRESETS: Readonly<Record<string, HSV>> = {
  red:    { h: 0,   s: 1000, v: 1000 },
  orange: { h: 30,  s: 1000, v: 1000 },
  yellow: { h: 60,  s: 1000, v: 1000 },
  green:  { h: 120, s: 1000, v: 1000 },
  cyan:   { h: 180, s: 1000, v: 1000 },
  blue:   { h: 240, s: 1000, v: 1000 },
  purple: { h: 280, s: 1000, v: 1000 },
  pink:   { h: 320, s: 1000, v: 1000 },
};

/**
 * Resolves a color from either a preset name string or a raw HSV object.
 *
 * @param input - Preset name (e.g. `"red"`) or `{ h, s, v }` object.
 * @returns The resolved `HSV` value, or `null` if the input is invalid.
 *
 * @example
 * resolveColor("red")                    // { h: 0, s: 1000, v: 1000 }
 * resolveColor({ h: 240, s: 800, v: 900 }) // { h: 240, s: 800, v: 900 }
 * resolveColor("unknown")               // null
 */
export function resolveColor(input: unknown): HSV | null {
  if (typeof input === "string") {
    return PRESETS[input.toLowerCase()] ?? null;
  }
  if (typeof input === "object" && input !== null) {
    const { h, s, v } = input as Record<string, unknown>;
    if (typeof h === "number" && typeof s === "number" && typeof v === "number") {
      return { h, s, v };
    }
  }
  return null;
}

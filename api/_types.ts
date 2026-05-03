/**
 * Shared TypeScript types used across the API.
 */

/** A single entry in the Tuya device status response. */
export interface TuyaStatusItem {
  code: string;
  value: unknown;
}

/**
 * Snapshot of the bulb's state captured before a flash sequence,
 * used to restore the original state afterward.
 */
export interface BulbSnapshot {
  on: boolean;
  mode: string;
  brightness: number;
  temperature: number;
  colour: unknown;
}

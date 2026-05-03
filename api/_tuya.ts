import * as crypto from "crypto";
import axios from "axios";
import type { TuyaStatusItem } from "./_types";

// ---------------------------------------------------------------------------
// Token cache — reused across requests within the same serverless instance.
// On cold starts the token is re-fetched automatically.
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Reads Tuya credentials from env vars at call time (never at module load). */
function cfg() {
  return {
    clientId : process.env.TUYA_ACCESS_KEY ?? "",
    secretKey: process.env.TUYA_SECRET_KEY ?? "",
    baseUrl  : process.env.TUYA_BASE_URL   ?? "https://openapi.tuyaeu.com",
    deviceId : process.env.TUYA_DEVICE_ID  ?? "",
  };
}

// ---------------------------------------------------------------------------
// Tuya HMAC-SHA256 signing — implemented manually because the official SDK
// (@tuya/tuya-connector-nodejs) produces "sign invalid" (1004) errors.
// Reference: https://developer.tuya.com/en/docs/cloud/signingalgorithm
// ---------------------------------------------------------------------------

function sha256hex(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function hmacSHA256(str: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}

/**
 * Builds the Tuya HMAC-SHA256 signature string.
 * For token requests `accessToken` is an empty string.
 */
function buildSign(
  method: string,
  path: string,
  body: string,
  accessToken: string,
  t: string,
  clientId: string,
  secretKey: string
): string {
  const contentHash  = sha256hex(body);
  const stringToSign = [method, contentHash, "", path].join("\n");
  const strToHmac    = clientId + accessToken + t + stringToSign;
  return hmacSHA256(strToHmac, secretKey);
}

/** Fetches a fresh access token or returns the cached one if still valid. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const { clientId, secretKey, baseUrl } = cfg();
  const t    = Date.now().toString();
  const path = "/v1.0/token?grant_type=1";
  const sign = buildSign("GET", path, "", "", t, clientId, secretKey);

  const res = await axios.get(`${baseUrl}${path}`, {
    headers: { client_id: clientId, sign, t, sign_method: "HMAC-SHA256", nonce: "" },
  });

  if (!res.data.success) {
    throw new Error(`Tuya token error ${res.data.code}: ${res.data.msg}`);
  }

  const { access_token, expire_time } = res.data.result;
  cachedToken = { token: access_token, expiresAt: Date.now() + (expire_time - 60) * 1000 };
  return access_token;
}

/** Internal helper — signs and fires any Tuya OpenAPI request. */
async function tuyaRequest<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const { clientId, secretKey, baseUrl } = cfg();
  const accessToken = await getAccessToken();
  const t           = Date.now().toString();
  const bodyStr     = body ? JSON.stringify(body) : "";
  const sign        = buildSign(method, path, bodyStr, accessToken, t, clientId, secretKey);

  const headers: Record<string, string> = {
    client_id: clientId,
    access_token: accessToken,
    sign,
    t,
    sign_method: "HMAC-SHA256",
    nonce: "",
    ...(body ? { "Content-Type": "application/json" } : {}),
  };

  const res = await axios.request({ method, url: `${baseUrl}${path}`, headers, data: body });

  if (!res.data.success) {
    throw new Error(`Tuya API error ${res.data.code}: ${res.data.msg}`);
  }

  return res.data.result as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full status of the configured device as an array of
 * `{ code, value }` entries (e.g. switch_led, work_mode, bright_value_v2…).
 */
export async function getDeviceStatus(): Promise<TuyaStatusItem[]> {
  const { deviceId } = cfg();
  return tuyaRequest<TuyaStatusItem[]>("GET", `/v1.0/devices/${deviceId}/status`);
}

/**
 * Sends one or more commands to the configured device.
 * Each command is a `{ code, value }` pair matching a Tuya DP code.
 *
 * @example
 * await sendCommands([{ code: "switch_led", value: false }]);
 */
export async function sendCommands(
  commands: Array<{ code: string; value: unknown }>
): Promise<unknown> {
  const { deviceId } = cfg();
  return tuyaRequest("POST", `/v1.0/devices/${deviceId}/commands`, { commands });
}

import * as crypto from "crypto";
import axios from "axios";

let cachedToken: { token: string; expiresAt: number } | null = null;

function cfg() {
  return {
    clientId : process.env.TUYA_ACCESS_KEY ?? "",
    secretKey: process.env.TUYA_SECRET_KEY ?? "",
    baseUrl  : process.env.TUYA_BASE_URL   ?? "https://openapi.tuyaeu.com",
    deviceId : process.env.TUYA_DEVICE_ID  ?? "",
  };
}

function sha256hex(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function hmacSHA256(str: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}

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
  };
  if (body) headers["Content-Type"] = "application/json";

  const res = await axios.request({ method, url: `${baseUrl}${path}`, headers, data: body });

  if (!res.data.success) {
    throw new Error(`Tuya API error ${res.data.code}: ${res.data.msg}`);
  }

  return res.data.result as T;
}

export async function getDeviceStatus(): Promise<unknown> {
  const { deviceId } = cfg();
  return tuyaRequest("GET", `/v1.0/devices/${deviceId}/status`);
}

export async function sendCommands(
  commands: Array<{ code: string; value: unknown }>
): Promise<unknown> {
  const { deviceId } = cfg();
  return tuyaRequest("POST", `/v1.0/devices/${deviceId}/commands`, { commands });
}

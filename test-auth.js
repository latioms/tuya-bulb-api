/**
 * Diagnostic script: tests Tuya auth from scratch, bypassing the SDK.
 * Run with: node test-auth.js
 */

const https = require("https");
const crypto = require("crypto");

// ── Credentials ─────────────────────────────────────────
const CLIENT_ID  = "5aud8fs7s8nv3h58hrug";
const SECRET_KEY = "30ec9c2c06544caf97e34c6bdb0da42c";
const BASE_URL   = "openapi.tuyaeu.com";
// ────────────────────────────────────────────────────────

function sha256hex(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function hmacSHA256(str, secret) {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}

async function getToken() {
  const t     = Date.now().toString();
  const nonce = "";
  const method = "GET";
  const path   = "/v1.0/token?grant_type=1";

  const contentHash = sha256hex("");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const strToHmac   = CLIENT_ID + t + nonce + stringToSign;
  const sign        = hmacSHA256(strToHmac, SECRET_KEY);

  console.log("─── Debug info ────────────────────────────────────");
  console.log("timestamp :", t);
  console.log("contentHash:", contentHash);
  console.log("stringToSign:\n" + stringToSign);
  console.log("strToHmac  :", strToHmac);
  console.log("sign       :", sign);
  console.log("───────────────────────────────────────────────────\n");

  const options = {
    hostname: BASE_URL,
    path: path,
    method: "GET",
    headers: {
      "client_id"  : CLIENT_ID,
      "sign"       : sign,
      "t"          : t,
      "sign_method": "HMAC-SHA256",
      "nonce"      : nonce,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        console.log("HTTP status:", res.statusCode);
        try {
          const json = JSON.parse(body);
          console.log("Response:", JSON.stringify(json, null, 2));
          resolve(json);
        } catch {
          console.log("Raw body:", body);
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getDeviceStatus(accessToken) {
  const DEVICE_ID = "bfafb74f941dd42806rbkh";
  const t      = Date.now().toString();
  const nonce  = "";
  const method = "GET";
  const path   = `/v1.0/devices/${DEVICE_ID}/status`;

  const contentHash  = sha256hex("");
  const stringToSign = [method, contentHash, "", path].join("\n");
  const strToHmac    = CLIENT_ID + accessToken + t + nonce + stringToSign;
  const sign         = hmacSHA256(strToHmac, SECRET_KEY);

  const options = {
    hostname: BASE_URL,
    path: path,
    method: "GET",
    headers: {
      "client_id"   : CLIENT_ID,
      "access_token": accessToken,
      "sign"        : sign,
      "t"           : t,
      "sign_method" : "HMAC-SHA256",
      "nonce"       : nonce,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const json = JSON.parse(body);
        console.log("\nDevice status response:", JSON.stringify(json, null, 2));
        resolve(json);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

getToken()
  .then((r) => r.success && getDeviceStatus(r.result.access_token))
  .catch(console.error);

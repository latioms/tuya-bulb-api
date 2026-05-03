/**
 * Test script: auth + device commands, bypassing vercel dev.
 * Usage:
 *   node test-auth.js          → status only
 *   node test-auth.js on       → turn on
 *   node test-auth.js off      → turn off
 *   node test-auth.js dim 300  → brightness 10-1000
 *   node test-auth.js temp 500 → color temp 0-1000
 *   node test-auth.js color 240 1000 1000 → HSV color
 */

const https = require("https");
const crypto = require("crypto");

const CLIENT_ID  = "5aud8fs7s8nv3h58hrug";
const SECRET_KEY = "30ec9c2c06544caf97e34c6bdb0da42c";
const DEVICE_ID  = "bfafb74f941dd42806rbkh";
const BASE_URL   = "openapi.tuyaeu.com";

function sha256hex(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function hmacSHA256(str, secret) {
  return crypto.createHmac("sha256", secret).update(str).digest("hex").toUpperCase();
}
function buildSign(method, path, body, accessToken, t) {
  const hash = sha256hex(body);
  const sts  = [method, hash, "", path].join("\n");
  return hmacSHA256(CLIENT_ID + accessToken + t + sts, SECRET_KEY);
}

function tuyaRequest(method, path, body, accessToken) {
  const t    = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = buildSign(method, path, bodyStr, accessToken ?? "", t);

  console.log(`\n→ ${method} https://${BASE_URL}${path}`);
  if (body) console.log("  body:", JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL, path, method,
      headers: {
        "client_id": CLIENT_ID,
        ...(accessToken ? { "access_token": accessToken } : {}),
        "sign": sign, "t": t, "sign_method": "HMAC-SHA256", "nonce": "",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const json = JSON.parse(data);
        console.log(`  ← HTTP ${res.statusCode} | success:${json.success} | code:${json.code ?? "-"} | msg:${json.msg ?? "-"}`);
        resolve(json);
      });
    });
    req.on("error", reject);
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log("── 1. Getting token ─────────────────────────────");
  const tokenRes = await tuyaRequest("GET", "/v1.0/token?grant_type=1", null, null);
  if (!tokenRes.success) throw new Error(`Token failed: ${tokenRes.msg}`);
  const token = tokenRes.result.access_token;
  console.log("  token:", token.slice(0, 8) + "...");

  const [,, cmd, ...args] = process.argv;

  if (!cmd || cmd === "status") {
    console.log("\n── 2. Getting device status ─────────────────────");
    const res = await tuyaRequest("GET", `/v1.0/devices/${DEVICE_ID}/status`, null, token);
    if (!res.success) {
      console.error(`\n✗ Error ${res.code}: ${res.msg}`);
      if (res.code === 1204 || res.msg?.includes("offline")) {
        console.error("  → The bulb is OFFLINE. Check WiFi + Tuya app pairing.");
      }
      return;
    }
    console.log("\nDevice state:");
    res.result.forEach(({ code, value }) => console.log(`  ${code}: ${JSON.stringify(value)}`));
    return;
  }

  let commands;
  if      (cmd === "on")    { commands = [{ code: "switch_led", value: true }]; }
  else if (cmd === "off")   { commands = [{ code: "switch_led", value: false }]; }
  else if (cmd === "dim")   { commands = [{ code: "work_mode", value: "white" }, { code: "bright_value_v2", value: Number(args[0]) }]; }
  else if (cmd === "temp")  { commands = [{ code: "work_mode", value: "white" }, { code: "temp_value_v2",   value: Number(args[0]) }]; }
  else if (cmd === "color") { commands = [{ code: "work_mode", value: "colour" }, { code: "colour_data_v2", value: { h: Number(args[0]), s: Number(args[1]), v: Number(args[2]) } }]; }
  else { console.error("Unknown command:", cmd); process.exit(1); }

  console.log(`\n── 2. Sending command: ${cmd} ────────────────────`);
  const res = await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`, { commands }, token);
  if (res.success) {
    console.log("\n✓ Command sent successfully!");
  } else {
    console.error(`\n✗ Error ${res.code}: ${res.msg}`);
    if (res.code === 1204 || res.msg?.includes("offline")) {
      console.error("  → The bulb is OFFLINE.");
      console.error("  → Fix: open the Tuya Smart app, make sure the bulb appears online.");
      console.error("  → The bulb must be on the same Tuya account as this project.");
    }
  }
}

main().catch(console.error);

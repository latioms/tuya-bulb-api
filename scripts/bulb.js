/**
 * Bulb CLI — direct Tuya control, no server needed.
 *
 * Usage:
 *   npm run bulb                            → status
 *   npm run bulb on / off                  → power
 *   npm run bulb color red                 → preset color
 *   npm run bulb color 240 1000 1000       → HSV color
 *   npm run bulb dim 300                   → brightness 10-1000
 *   npm run bulb temp 500                  → color temp 0-1000
 *   npm run bulb flash red                 → flash 3× red then restore
 *   npm run bulb flash red 5               → flash 5× red
 *   npm run bulb flash red 10s             → flash for 10 seconds then restore (max 300s)
 *   npm run bulb presets                   → list preset colors
 *
 * Preset colors: red, orange, yellow, green, cyan, blue, purple, pink
 */

const https = require("https");
const crypto = require("crypto");

const CLIENT_ID  = "5aud8fs7s8nv3h58hrug";
const SECRET_KEY = "30ec9c2c06544caf97e34c6bdb0da42c";
const DEVICE_ID  = "bfafb74f941dd42806rbkh";
const BASE_URL   = "openapi.tuyaeu.com";

const PRESETS = {
  red:    { h: 0,   s: 1000, v: 1000 },
  orange: { h: 30,  s: 1000, v: 1000 },
  yellow: { h: 60,  s: 1000, v: 1000 },
  green:  { h: 120, s: 1000, v: 1000 },
  cyan:   { h: 180, s: 1000, v: 1000 },
  blue:   { h: 240, s: 1000, v: 1000 },
  purple: { h: 280, s: 1000, v: 1000 },
  pink:   { h: 320, s: 1000, v: 1000 },
};

function resolveColor(name) {
  return PRESETS[name?.toLowerCase()] ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  else if (cmd === "presets") {
    console.log("\nAvailable presets:");
    Object.entries(PRESETS).forEach(([name, hsv]) =>
      console.log(`  ${name.padEnd(8)} → h:${hsv.h}, s:${hsv.s}, v:${hsv.v}`)
    );
    return;
  }
  else if (cmd === "color") {
    const preset = resolveColor(args[0]);
    const hsv = preset ?? { h: Number(args[0]), s: Number(args[1]), v: Number(args[2]) };
    commands = [{ code: "work_mode", value: "colour" }, { code: "colour_data_v2", value: hsv }];
  }
  else if (cmd === "flash") {
    const colorName = args[0];
    const color = resolveColor(colorName);
    if (!color) {
      console.error(`Unknown preset "${colorName}". Use: ${Object.keys(PRESETS).join(", ")}`);
      process.exit(1);
    }
    const duration = 1000; // ms per half-blink (on + off = 2s per cycle)
    const MAX_SECONDS = 300;

    // args[1] can be:
    //   "5s"  → flash for 5 seconds total (times calculated automatically)
    //   "5"   → flash 5 times
    let times;
    const rawCount = args[1];
    if (rawCount !== undefined && String(rawCount).endsWith("s")) {
      const secs   = Math.min(Math.max(parseFloat(rawCount), 1), MAX_SECONDS);
      times        = Math.max(1, Math.floor((secs * 1000) / (duration * 2)));
      console.log(`  → ${secs}s at ${duration}ms/blink = ${times} flashes`);
    } else {
      times = Number(rawCount) || 3;
    }

    const totalSec = ((times * duration * 2) / 1000).toFixed(1);

    // Save current state
    console.log("\n── 2. Saving current state ──────────────────────");
    const statusRes = await tuyaRequest("GET", `/v1.0/devices/${DEVICE_ID}/status`, null, token);
    const get = (code) => statusRes.result?.find((s) => s.code === code)?.value;
    const wasOn      = get("switch_led");
    const origMode   = get("work_mode");
    const origBright = get("bright_value_v2");
    const origTemp   = get("temp_value_v2");
    const origColour = get("colour_data_v2");

    console.log(`\n── 3. Flashing ${colorName} × ${times} (~${totalSec}s total) ──`);

    // If the bulb is off, turn it on first so it receives the colour commands
    if (!wasOn) {
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "switch_led", value: true }] }, token);
      await sleep(500); // brief settle time
    }

    for (let i = 0; i < times; i++) {
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "work_mode", value: "colour" }, { code: "colour_data_v2", value: color }] }, token);
      await sleep(duration);
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "bright_value_v2", value: 10 }] }, token);
      await sleep(duration);
    }

    console.log("\n── 4. Restoring original state ──────────────────");
    if (!wasOn) {
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "switch_led", value: false }] }, token);
    } else if (origMode === "colour") {
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "work_mode", value: "colour" }, { code: "colour_data_v2", value: typeof origColour === "string" ? JSON.parse(origColour) : origColour }] }, token);
    } else {
      await tuyaRequest("POST", `/v1.0/devices/${DEVICE_ID}/commands`,
        { commands: [{ code: "work_mode", value: "white" }, { code: "bright_value_v2", value: origBright }, { code: "temp_value_v2", value: origTemp }] }, token);
    }
    console.log("\n✓ Flash complete!");
    return;
  }
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

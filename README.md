# bulb-api

A self-hosted REST API to control Tuya smart bulbs (Wi-Fi), deployed on **Vercel**.  
Built with TypeScript + Vercel Serverless Functions, using a hand-rolled Tuya HMAC-SHA256 auth implementation (the official SDK produces auth errors).

---

## Table of contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Deployment](#deployment)
- [Authentication](#authentication)
- [API reference](#api-reference)
  - [GET /api](#get-api)
  - [GET /api/status](#get-apistatus)
  - [POST /api/power](#post-apipower)
  - [POST /api/brightness](#post-apibrightness)
  - [POST /api/temperature](#post-apitemperature)
  - [POST /api/color](#post-apicolor)
  - [POST /api/flash](#post-apiflash)
- [Color presets](#color-presets)
- [CLI](#cli)
- [Project structure](#project-structure)

---

## Setup

```bash
git clone <repo>
cd bulb-api
npm install
cp .env.example .env.local
# Fill in .env.local with your credentials (see below)
```

---

## Environment variables

| Variable          | Description                                                     |
|-------------------|-----------------------------------------------------------------|
| `TUYA_ACCESS_KEY` | Tuya Cloud project Client ID                                    |
| `TUYA_SECRET_KEY` | Tuya Cloud project Client Secret                                |
| `TUYA_DEVICE_ID`  | Device ID of the bulb to control                                |
| `TUYA_BASE_URL`   | Regional API base URL (see below)                               |
| `API_KEY`         | Your internal API key — required on every request               |

**Regional base URLs:**

| Region | URL                          |
|--------|------------------------------|
| EU     | `https://openapi.tuyaeu.com` |
| US     | `https://openapi.tuyaus.com` |
| CN     | `https://openapi.tuyacn.com` |
| IN     | `https://openapi.tuyain.com` |

Generate a strong `API_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Running locally

```bash
npm run dev
# → http://localhost:3000
```

> Uses `vercel dev`. All env vars in `.env.local` are loaded automatically.

---

## Deployment

```bash
# First deploy: configure env vars interactively
npx vercel env add TUYA_ACCESS_KEY
npx vercel env add TUYA_SECRET_KEY
npx vercel env add TUYA_DEVICE_ID
npx vercel env add TUYA_BASE_URL
npx vercel env add API_KEY

# Deploy to production
npm run deploy
```

---

## Authentication

All endpoints (except `GET /api`) require the `x-api-key` header:

```
x-api-key: <your API_KEY>
```

Missing or wrong key → `401 Unauthorized`.

---

## API reference

All request bodies are JSON (`Content-Type: application/json`).  
All error responses have the shape `{ "error": "..." }`.

---

### GET /api

Health check. Returns the route map and available presets. **No auth required.**

```bash
curl http://localhost:3000/api
```

---

### GET /api/status

Returns the full device status as an array of `{ code, value }` DP entries.

```bash
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/status
```

---

### POST /api/power

Turn the bulb on or off.

| Field | Type    | Required | Description       |
|-------|---------|----------|-------------------|
| `on`  | boolean | ✅        | `true` = on, `false` = off |

```bash
curl -X POST http://localhost:3000/api/power \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

---

### POST /api/brightness

Set brightness in white mode.

| Field   | Type    | Required | Range    | Description    |
|---------|---------|----------|----------|----------------|
| `value` | integer | ✅        | 10–1000  | Brightness level |

```bash
curl -X POST http://localhost:3000/api/brightness \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value": 500}'
```

---

### POST /api/temperature

Set white color temperature.

| Field   | Type    | Required | Range   | Description              |
|---------|---------|----------|---------|--------------------------|
| `value` | integer | ✅        | 0–1000  | 0 = warm white, 1000 = cool white |

```bash
curl -X POST http://localhost:3000/api/temperature \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value": 200}'
```

---

### POST /api/color

Switch the bulb to colour mode and set the color.

| Field   | Type             | Required | Description                         |
|---------|------------------|----------|-------------------------------------|
| `color` | string           | ✅ (or HSV) | Preset name (e.g. `"red"`)       |
| `h`     | number           | ✅ (or preset) | Hue 0–360                      |
| `s`     | number           | ✅ (or preset) | Saturation 0–1000              |
| `v`     | number           | ✅ (or preset) | Value (brightness) 0–1000      |

```bash
# Using a preset
curl -X POST http://localhost:3000/api/color \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color": "blue"}'

# Using raw HSV
curl -X POST http://localhost:3000/api/color \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"h": 240, "s": 800, "v": 900}'
```

---

### POST /api/flash

Flash the bulb in a given color N times (or for S seconds), then **restore the original state** automatically.

| Field      | Type             | Required | Default | Description                                              |
|------------|------------------|----------|---------|----------------------------------------------------------|
| `color`    | string or object | ✅        | —       | Preset name or `{ h, s, v }`                             |
| `times`    | integer          | —        | `3`     | Number of flashes (1–20). Ignored if `seconds` is set.   |
| `seconds`  | number           | —        | —       | Flash for this many seconds total (1–300). Overrides `times`. |
| `duration` | integer          | —        | `1000`  | Milliseconds per half-blink (on or off). Full cycle = `duration × 2`. Range: 200–2000. |

```bash
# Flash red 3 times (default)
curl -X POST http://localhost:3000/api/flash \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color": "red"}'

# Flash green 5 times
curl -X POST http://localhost:3000/api/flash \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color": "green", "times": 5}'

# Flash blue for 10 seconds
curl -X POST http://localhost:3000/api/flash \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color": "blue", "seconds": 10}'
```

**Response:**
```json
{ "ok": true, "flashed": 5, "duration": 1000, "color": { "h": 120, "s": 1000, "v": 1000 } }
```

> ⚠️ Vercel Hobby plan has a **10s serverless timeout**. For long flash sequences, use the CLI instead.

---

## Color presets

| Name     | Hue | Description     |
|----------|-----|-----------------|
| `red`    | 0   | Red             |
| `orange` | 30  | Orange          |
| `yellow` | 60  | Yellow          |
| `green`  | 120 | Green           |
| `cyan`   | 180 | Cyan            |
| `blue`   | 240 | Blue            |
| `purple` | 280 | Purple          |
| `pink`   | 320 | Pink            |

All presets use full saturation and brightness (`s: 1000, v: 1000`).

---

## CLI

A local CLI script for direct Tuya control, bypassing the HTTP server.  
Useful for testing, scripting, and long flash sequences that exceed serverless timeouts.

```bash
npm run bulb                        # device status
npm run bulb on                     # turn on
npm run bulb off                    # turn off
npm run bulb dim 500                # set brightness (10–1000)
npm run bulb temp 200               # set color temperature (0–1000)
npm run bulb color red              # set color by preset
npm run bulb color 240 1000 1000    # set color by HSV
npm run bulb flash red              # flash red 3× then restore
npm run bulb flash red 5            # flash red 5×
npm run bulb flash red 10s          # flash red for 10 seconds
npm run bulb presets                # list all preset colors
```

---

## Project structure

```
.
├── api/
│   ├── _auth.ts        # withAuth() HOF — API key middleware
│   ├── _body.ts        # parseBody() — manual stream-based JSON parser
│   ├── _errors.ts      # Errors.* — centralized HTTP error helpers
│   ├── _presets.ts     # PRESETS + resolveColor() — named color map
│   ├── _tuya.ts        # Tuya HMAC-SHA256 client (no SDK)
│   ├── _types.ts       # Shared TypeScript interfaces
│   ├── index.ts        # GET  /api       — health check + route map
│   ├── status.ts       # GET  /api/status
│   ├── power.ts        # POST /api/power
│   ├── brightness.ts   # POST /api/brightness
│   ├── temperature.ts  # POST /api/temperature
│   ├── color.ts        # POST /api/color
│   └── flash.ts        # POST /api/flash
├── scripts/
│   └── bulb.js         # CLI tool (Node.js, no server needed)
├── .env.example        # Environment variable template
├── .env.local          # Local credentials (git-ignored)
├── vercel.json         # Vercel configuration
├── tsconfig.json
└── package.json
```

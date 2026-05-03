import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as crypto from "crypto";
import { getDeviceStatus, sendCommands } from "../_tuya";
import { PRESETS } from "../_presets";
import { Errors } from "../_errors";
import type { TuyaStatusItem, BulbSnapshot } from "../_types";

export const config = { api: { bodyParser: false } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total flash duration in seconds for success/failure events. */
const FLASH_SECONDS = 30;
/** Duration of each half-blink (on or off). Full cycle = BLINK_DURATION_MS × 2. */
const BLINK_DURATION_MS = 1000;
/** Number of flashes derived from the desired total duration. */
const FLASH_TIMES = Math.floor((FLASH_SECONDS * 1000) / (BLINK_DURATION_MS * 2)); // = 15

// ---------------------------------------------------------------------------
// GitHub webhook payload types
// ---------------------------------------------------------------------------

type WorkflowRunAction = "requested" | "in_progress" | "completed";
type WorkflowRunConclusion = "success" | "failure" | "cancelled" | "timed_out" | "skipped" | null;

interface GitHubWorkflowRunPayload {
  action: WorkflowRunAction;
  workflow_run: {
    name: string;
    conclusion: WorkflowRunConclusion;
    html_url: string;
  };
  repository: {
    full_name: string;
  };
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies the GitHub webhook signature.
 * GitHub signs the raw body with HMAC-SHA256 using the webhook secret.
 * The header value is prefixed with "sha256=".
 */
function verifySignature(rawBody: string, header: string, secret: string): boolean {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Bulb helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function snapshotBulb(): Promise<BulbSnapshot> {
  const items = await getDeviceStatus() as TuyaStatusItem[];
  const get = (code: string) => items.find((s) => s.code === code)?.value;
  return {
    on:          get("switch_led") as boolean,
    mode:        get("work_mode") as string,
    brightness:  get("bright_value_v2") as number,
    temperature: get("temp_value_v2") as number,
    colour:      get("colour_data_v2"),
  };
}

async function restoreBulb(snapshot: BulbSnapshot): Promise<void> {
  if (!snapshot.on) {
    await sendCommands([{ code: "switch_led", value: false }]);
  } else if (snapshot.mode === "colour") {
    const colour = typeof snapshot.colour === "string"
      ? JSON.parse(snapshot.colour)
      : snapshot.colour;
    await sendCommands([
      { code: "work_mode",      value: "colour" },
      { code: "colour_data_v2", value: colour },
    ]);
  } else {
    await sendCommands([
      { code: "work_mode",       value: "white" },
      { code: "bright_value_v2", value: snapshot.brightness },
      { code: "temp_value_v2",   value: snapshot.temperature },
    ]);
  }
}

async function flashAndRestore(color: { h: number; s: number; v: number }): Promise<void> {
  const snapshot = await snapshotBulb();

  // Wake the bulb if it's off so it receives colour commands
  if (!snapshot.on) {
    await sendCommands([{ code: "switch_led", value: true }]);
    await sleep(500);
  }

  for (let i = 0; i < FLASH_TIMES; i++) {
    await sendCommands([
      { code: "work_mode",      value: "colour" },
      { code: "colour_data_v2", value: color },
    ]);
    await sleep(BLINK_DURATION_MS);
    await sendCommands([{ code: "bright_value_v2", value: 10 }]);
    await sleep(BLINK_DURATION_MS);
  }

  await restoreBulb(snapshot);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Build started — steady orange to signal work in progress. */
async function onBuildStarted(): Promise<void> {
  await sendCommands([
    { code: "switch_led",     value: true },
    { code: "work_mode",      value: "colour" },
    { code: "colour_data_v2", value: PRESETS.orange },
  ]);
}

/** Build succeeded — flash green for 30 seconds then restore. */
async function onBuildSuccess(): Promise<void> {
  await flashAndRestore(PRESETS.green);
}

/** Build failed or cancelled — flash red for 30 seconds then restore. */
async function onBuildFailure(): Promise<void> {
  await flashAndRestore(PRESETS.red);
}

/** Push event — show blue for 5 seconds then restore. */
async function onPush(): Promise<void> {
  const snapshot = await snapshotBulb();

  // Turn on and set to blue
  await sendCommands([
    { code: "switch_led",     value: true },
    { code: "work_mode",      value: "colour" },
    { code: "colour_data_v2", value: PRESETS.blue },
  ]);

  // Wait 5 seconds
  await sleep(5000);

  // Restore previous state
  await restoreBulb(snapshot);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/webhooks/github
 *
 * Receives GitHub webhook events and drives the bulb:
 * 
 * **Push events** (`push`):
 * - Bulb turns blue for 5 seconds, then returns to previous state
 *
 * **Workflow run events** (`workflow_run`):
 * - `requested` / `in_progress`          → steady orange
 * - `completed` + conclusion `success`   → flash green × 15 (~30s) then restore
 * - `completed` + any failure/cancel     → flash red  × 15 (~30s) then restore
 *
 * Setup:
 * 1. GitHub repo → Settings → Webhooks → Add webhook
 * 2. Payload URL: https://<your-domain>/api/webhooks/github
 * 3. Content type: application/json
 * 4. Secret: value of GITHUB_WEBHOOK_SECRET env var
 * 5. Events: select "Workflow runs" and "Pushes"
 *
 * Required env var: GITHUB_WEBHOOK_SECRET
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return Errors.methodNotAllowed(res);

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "GITHUB_WEBHOOK_SECRET env var is not configured" });
  }

  const rawBody = await readRawBody(req);

  const signature = String(req.headers["x-hub-signature-256"] ?? "");
  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const githubEvent = req.headers["x-github-event"];

  // Handle push events
  if (githubEvent === "push") {
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Errors.badRequest(res, "Invalid JSON payload");
    }
    await onPush();
    return res.status(200).json({ ok: true, event: "push", repo: payload.repository.full_name });
  }

  // Handle workflow_run events
  if (githubEvent !== "workflow_run") {
    return res.status(200).json({ ok: true, event: githubEvent, action: "ignored" });
  }

  let payload: GitHubWorkflowRunPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Errors.badRequest(res, "Invalid JSON payload");
  }

  const { action, workflow_run, repository } = payload;
  const meta = { workflow: workflow_run.name, repo: repository.full_name, action };

  switch (action) {
    case "requested":
    case "in_progress":
      await onBuildStarted();
      break;
    case "completed":
      if (workflow_run.conclusion === "success") {
        await onBuildSuccess();
      } else {
        await onBuildFailure();
      }
      break;
    default:
      return res.status(200).json({ ok: true, ...meta, bulb: "ignored" });
  }

  return res.status(200).json({ ok: true, ...meta, conclusion: workflow_run.conclusion ?? "-" });
}

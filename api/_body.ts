import type { VercelRequest } from "@vercel/node";
import type { IncomingMessage } from "http";

/** Adds quotes around unquoted object keys: `{on:false}` → `{"on":false}`. */
function fixUnquotedKeys(str: string): string {
  return str.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

/**
 * Reads and parses the raw request body as JSON.
 *
 * Must be used when `export const config = { api: { bodyParser: false } }` is set,
 * which is required to avoid `@vercel/node` v5's lazy body parser throwing on
 * non-standard JSON before our handler code runs.
 *
 * As a convenience, also handles unquoted JS object notation (e.g. from PowerShell's
 * `curl.exe` stripping double quotes).
 *
 * @throws {Error} If the body cannot be parsed as JSON.
 */
export async function parseBody<T = unknown>(req: VercelRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    (req as unknown as IncomingMessage).on("data", (chunk: Buffer) => chunks.push(chunk));
    (req as unknown as IncomingMessage).on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        try {
          resolve(JSON.parse(fixUnquotedKeys(raw)) as T);
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      }
    });
    (req as unknown as IncomingMessage).on("error", reject);
  });
}

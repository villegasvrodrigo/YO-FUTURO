import type { ChatMessage } from './extraction';

export const EXTRACT_TIMEOUT_MS = 70_000;
export const SYNTHESIZE_TIMEOUT_MS = 130_000;
export const SLOW_SYNTHESIS_WARNING_MS = 45_000;

/**
 * POSTs { transcript } to `url` and returns the parsed JSON body, aborting the request
 * after `timeoutMs`. Without this, a connection that stalls or gets silently dropped
 * somewhere between the browser and Vercel (the function itself can still finish and log
 * 200 server-side) leaves the caller's `await` pending forever, since a plain `fetch`
 * never times out on its own.
 */
export async function fetchJsonWithTimeout(
  url: string,
  transcript: ChatMessage[],
  defaultErrorMessage: string,
  timeoutMs: number,
  timeoutErrorMessage: string
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(timeoutErrorMessage);
      }
      throw err;
    }
    if (!res.ok) {
      let message = defaultErrorMessage;
      try {
        const body = await res.json();
        message = body.error ?? message;
      } catch {
        // Non-JSON error body (e.g. a platform error page): keep the default message.
      }
      throw new Error(message);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

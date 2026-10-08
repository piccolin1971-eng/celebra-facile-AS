/** Attesa breve tra tentativi di rete (backoff lineare). */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ripete `fn` fino a `attempts` volte. Utile per CEI / liturgiadelleore.it a singhiozzo.
 * Non ritenta se `fn` restituisce un valore “ok” secondo `isOk` (default: truthy).
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: {
    attempts?: number;
    delayMs?: number;
    isOk?: (value: T) => boolean;
  },
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const delayMs = opts?.delayMs ?? 450;
  const isOk = opts?.isOk ?? ((v: T) => !!v);
  let last: T = undefined as T;
  for (let i = 0; i < attempts; i++) {
    last = await fn(i);
    if (isOk(last)) return last;
    if (i < attempts - 1) await sleepMs(delayMs * (i + 1));
  }
  return last;
}

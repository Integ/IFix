/** Shared-password gate (HTTP Basic Auth) for every request the Worker handles. */

export interface AuthEnv {
  /** Wrangler secret. Outside localhost the Worker refuses to serve until it is set. */
  APP_PASSWORD?: string;
  /** When bound, an IP that keeps sending wrong passwords is locked out for a while. */
  DB?: D1Database;
}

const CHALLENGE = 'Basic realm="Integ Workshop", charset="UTF-8"';

// Lock an IP once it has sent MAX_FAILURES wrong passwords within WINDOW_MS.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const THROTTLE_TIMEOUT_MS = 1_000;

function reply(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

// The username is ignored: this is a single shared password, not an account system.
function passwordFrom(header: string | null): string | null {
  const match = header?.match(/^Basic\s+(\S+)$/i);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    const credentials = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const colon = credentials.indexOf(":");
    return colon < 0 ? null : credentials.slice(colon + 1);
  } catch {
    return null;
  }
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// Hash both sides so the comparison runs over equal-length buffers and its
// timing does not reveal how much of the password matched.
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// --- Failed-attempt throttle ------------------------------------------------
// Best effort: it slows sustained guessing, but concurrent requests that all
// read the counter before any of them writes can slip past it. A long random
// APP_PASSWORD is still the real defence. Like the workshop tables, this table
// is created on demand so no separate migration has to run first.

type Failures = { failures: number; windowStart: number };

const throttleTableReady = new WeakSet<D1Database>();

// Never let a throttle storage problem block (or admit) a request on its own:
// the password check still decides, so skip throttling when D1 fails or is
// slow. The cap keeps this optional step from stalling every request.
async function failOpen<T>(work: () => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${THROTTLE_TIMEOUT_MS}ms`)), THROTTLE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error("auth throttle unavailable:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readFailures(db: D1Database, ip: string): Promise<Failures | null> {
  if (!throttleTableReady.has(db)) {
    await db
      .prepare("CREATE TABLE IF NOT EXISTS auth_failures (ip text PRIMARY KEY NOT NULL, failures integer NOT NULL, window_start integer NOT NULL)")
      .run();
    throttleTableReady.add(db);
  }
  return db
    .prepare("SELECT failures, window_start AS windowStart FROM auth_failures WHERE ip = ?")
    .bind(ip)
    .first<Failures>();
}

function lockedForSeconds(row: Failures, now: number) {
  if (row.failures < MAX_FAILURES) return 0;
  return Math.max(0, Math.ceil((row.windowStart + WINDOW_MS - now) / 1000));
}

async function recordFailure(db: D1Database, ip: string, now: number) {
  const expired = now - WINDOW_MS;
  await db.batch([
    db
      .prepare(`INSERT INTO auth_failures (ip, failures, window_start) VALUES (?1, 1, ?2)
        ON CONFLICT(ip) DO UPDATE SET
          failures = CASE WHEN window_start <= ?3 THEN 1 ELSE failures + 1 END,
          window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END`)
      .bind(ip, now, expired),
    // Drop other IPs' expired rows so the table stays small.
    db.prepare("DELETE FROM auth_failures WHERE window_start <= ?").bind(expired),
  ]);
}

async function clearFailures(db: D1Database, ip: string) {
  await db.prepare("DELETE FROM auth_failures WHERE ip = ?").bind(ip).run();
}

/** Returns a response that blocks the request, or null when it may proceed. */
export async function requireAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const expected = env.APP_PASSWORD;
  if (!expected) {
    if (isLocalhost(new URL(request.url).hostname)) return null;
    return reply(503, "站点尚未配置访问口令（APP_PASSWORD），暂不可用。");
  }

  // A browser's first request carries no credentials: answer the challenge
  // without counting it as a failed attempt or touching D1.
  const header = request.headers.get("Authorization");
  if (!header) return reply(401, "需要访问口令。", { "WWW-Authenticate": CHALLENGE });

  const ip = request.headers.get("CF-Connecting-IP");
  const throttle = env.DB && ip ? { db: env.DB, ip } : null;
  const now = Date.now();

  const prior = throttle ? await failOpen(() => readFailures(throttle.db, throttle.ip)) : null;
  const wait = prior ? lockedForSeconds(prior, now) : 0;
  if (wait > 0) {
    return reply(429, `口令错误次数过多，请 ${Math.ceil(wait / 60)} 分钟后再试。`, { "Retry-After": String(wait) });
  }

  const supplied = passwordFrom(header);
  if (supplied !== null && (await safeEqual(supplied, expected))) {
    if (throttle && prior) await failOpen(() => clearFailures(throttle.db, throttle.ip));
    return null;
  }

  if (throttle) await failOpen(() => recordFailure(throttle.db, throttle.ip, now));
  return reply(401, "需要访问口令。", { "WWW-Authenticate": CHALLENGE });
}

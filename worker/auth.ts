/** Shared-password gate (HTTP Basic Auth) for every request the Worker handles. */

export interface AuthEnv {
  /** Wrangler secret. Outside localhost the Worker refuses to serve until it is set. */
  APP_PASSWORD?: string;
}

const CHALLENGE = 'Basic realm="iFix Workshop", charset="UTF-8"';

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

/** Returns a response that blocks the request, or null when it may proceed. */
export async function requireAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const expected = env.APP_PASSWORD;
  if (!expected) {
    if (isLocalhost(new URL(request.url).hostname)) return null;
    return reply(503, "站点尚未配置访问口令（APP_PASSWORD），暂不可用。");
  }

  const supplied = passwordFrom(request.headers.get("Authorization"));
  if (supplied !== null && (await safeEqual(supplied, expected))) return null;

  return reply(401, "需要访问口令。", { "WWW-Authenticate": CHALLENGE });
}

/**
 * Telegram WebApp initData validation + signed-cookie session
 * Compatible with Cloudflare Workers (Web Crypto API only — no node:crypto)
 */

// ── HMAC helpers (Web Crypto) ────────────────────────────────────────────────

async function hmacSha256(keyData, message) {
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Telegram WebApp initData validation ─────────────────────────────────────

/**
 * Validates Telegram WebApp initData.
 * Returns the parsed user object on success, null on failure.
 */
export async function validateInitData(initData, botToken) {
  if (!botToken || typeof initData !== 'string' || !initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);

  if (!receivedHash || !Number.isInteger(authDate)) return null;
  if (authDate > now + 30) return null;        // clock skew
  if (now - authDate > 86400) return null;     // older than 24h

  const checkString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret = HMAC-SHA256("WebAppData", botToken)
  const secretKeyBuf = await hmacSha256(
    new TextEncoder().encode('WebAppData'),
    botToken
  );
  const expectedBuf = await hmacSha256(secretKeyBuf, checkString);
  const expected = bufToHex(expectedBuf);

  if (!timingSafeEqual(expected, receivedHash.toLowerCase())) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !/^\d+$/.test(String(user.id || ''))) return null;
    return user;
  } catch {
    return null;
  }
}

// ── Session cookie ───────────────────────────────────────────────────────────

/**
 * Signs a payload string: returns base64url(HMAC-SHA256(sessionSecret, payload))
 */
async function signPayload(payload, sessionSecret) {
  const keyBuf = new TextEncoder().encode(sessionSecret);
  const sigBuf = await hmacSha256(keyBuf, payload);
  return bufToBase64url(sigBuf);
}

/**
 * Creates a signed session cookie value: "<base64url-payload>.<signature>"
 */
export async function createSessionCookie(sessionData, sessionSecret) {
  const payload = bufToBase64url(new TextEncoder().encode(JSON.stringify(sessionData)));
  const sig = await signPayload(payload, sessionSecret);
  return `${payload}.${sig}`;
}

/**
 * Reads and verifies session cookie from a Request.
 * Returns the session object or null.
 */
export async function getSession(request, sessionSecret) {
  // If no secret configured — sessions cannot work
  if (!sessionSecret || sessionSecret.startsWith('YOUR_')) return null;
  const cookieHeader = request.headers.get('cookie') || '';
  const raw = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith('vv_tg='));
  if (!raw) return null;

  const value = raw.slice('vv_tg='.length);
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;

  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  const expectedSig = await signPayload(payload, sessionSecret);
  if (!timingSafeEqual(expectedSig, sig)) return null;

  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const session = JSON.parse(decoded);
    if (session.source !== 'miniapp') return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Builds the Set-Cookie header string for the session.
 */
export function buildSetCookieHeader(value, maxAge, request) {
  const isSecure = request
    ? (request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:')
    : true;
  const secure = isSecure ? '; Secure' : '';
  return `vv_tg=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

import {
  createClient,
  SupabaseClient,
} from '@supabase/supabase-js';
import { getEnv } from './env';

const SUPABASE_URL = getEnv('VITE_SUPABASE_GATEWAY_URL');
const ANON_KEY = getEnv('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Missing Supabase environment variables. Activate OptiDev Cloud first.');
}

// Detect if using Supabase Gateway (URL contains .sb- or .sb.)
const isGateway = SUPABASE_URL.includes('.sb-') || SUPABASE_URL.includes('.sb.');

// Extended session state with pre-computed WebSocket signature
interface GatewaySession {
  id: string;
  key: string;
  expiresAt: number;
  wsAuth?: { ts: number; sig: string };
}

let session: GatewaySession | null = null;
// Pending session request - prevents duplicate concurrent /session calls
let sessionPromise: Promise<void> | null = null;

// SHA-256 hash (URL-safe base64)
async function sha256Base64Url(message: string | ArrayBuffer): Promise<string> {
  const msgBuffer = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message;
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// HMAC-SHA256 signing (URL-safe base64)
async function hmacSign(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build canonical string with optional body hash
async function buildCanonical(
  sessionId: string, ts: number, method: string, path: string, body?: string | ArrayBuffer
): Promise<string> {
  let canonical = `${sessionId}\n${ts}\n${method}\n${path}`;
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    canonical += `\n${await sha256Base64Url(body)}`;
  }
  return canonical;
}

// Bootstrap session + refresh wsAuth when stale (deduplicated)
async function ensureSession(): Promise<void> {
  const now = Date.now() / 1000;

  // Need new session?
  const needsNewSession = !session || now >= session.expiresAt - 30;

  if (needsNewSession) {
    if (sessionPromise) {
      await sessionPromise;
    } else {
      sessionPromise = (async () => {
        try {
          const res = await fetch(`${SUPABASE_URL}/session`, { method: 'POST' });
          if (!res.ok) throw new Error('Failed to create gateway session');
          const data = await res.json();
          session = { id: data.session_id, key: data.session_key, expiresAt: data.expires_at };
        } finally {
          sessionPromise = null;
        }
      })();
      await sessionPromise;
    }
  }

  // Refresh wsAuth if stale (>20s old) or missing
  if (session && (!session.wsAuth || now - session.wsAuth.ts > 20)) {
    const ts = Math.floor(now);
    const canonical = `${session.id}\n${ts}\nGET\n/realtime/v1/websocket`;
    const sig = await hmacSign(session.key, canonical);
    session.wsAuth = { ts, sig };
  }
}

// Custom WebSocket class that adds HMAC auth params to URL
class SignedWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const urlObj = new URL(url.toString());
    if (session?.wsAuth) {
      urlObj.searchParams.set('x-session-id', session.id);
      urlObj.searchParams.set('x-ts', session.wsAuth.ts.toString());
      urlObj.searchParams.set('x-sig', session.wsAuth.sig);
    }
    super(urlObj.toString(), protocols);
  }
}

// Custom fetch with HMAC signing for gateway mode
async function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ensureSession();
  const url = new URL(input.toString());
  const ts = Math.floor(Date.now() / 1000);
  const method = init?.method || 'GET';

  // Resolve body for HMAC signing - handle string and binary (FormData/Blob) bodies
  let bodyForHash: string | ArrayBuffer | undefined;
  let fetchInit: RequestInit | undefined = init;

  if (init?.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    if (typeof init.body === 'string') {
      bodyForHash = init.body;
    } else {
      // Pre-serialize non-string bodies (FormData, Blob, ArrayBuffer) for deterministic HMAC
      const tempReq = new Request('http://x', { method, body: init.body });
      const bodyBuf = await tempReq.arrayBuffer();
      if (bodyBuf.byteLength > 0) {
        bodyForHash = bodyBuf;
        // Preserve content-type from serialization (includes boundary for FormData)
        const contentType = tempReq.headers.get('content-type');
        const newHeaders = new Headers(init.headers);
        if (contentType) newHeaders.set('content-type', contentType);
        fetchInit = { ...init, body: bodyBuf, headers: newHeaders };
      }
    }
  }

  const canonical = await buildCanonical(session!.id, ts, method, url.pathname, bodyForHash);
  const sig = await hmacSign(session!.key, canonical);

  const headers = new Headers(fetchInit?.headers);
  headers.set('x-session-id', session!.id);
  headers.set('x-ts', ts.toString());
  headers.set('x-sig', sig);

  let res = await fetch(input, { ...fetchInit, headers });

  const gatewayError = res.headers.get('x-gateway-error');
  if ((res.status === 401 || res.status === 403) && gatewayError) {
    session = null;
    await ensureSession();
    const retryTs = Math.floor(Date.now() / 1000);
    const retryCanonical = await buildCanonical(session!.id, retryTs, method, url.pathname, bodyForHash);
    headers.set('x-session-id', session!.id);
    headers.set('x-ts', retryTs.toString());
    headers.set('x-sig', await hmacSign(session!.key, retryCanonical));
    res = await fetch(input, { ...fetchInit, headers });
  }
  return res;
}

// Create Supabase client with gateway fetch and custom WebSocket transport
const baseSupabase: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  global: isGateway ? { fetch: gatewayFetch } : undefined,
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: isGateway ? {
    transport: SignedWebSocket as unknown as typeof WebSocket,
  } : undefined,
});

if (isGateway) {
  // 1. Blocks module until session + wsAuth ready (eliminates cold-load race)
  await ensureSession();

  // 2. Keeps session alive (prevents 5-min expiry)
  setInterval(() => {
    ensureSession().catch(() => {});
  }, 4 * 60 * 1000);

  // 3. Handles wake from sleep (interval was paused)
  baseSupabase.realtime.stateChangeCallbacks.open.push(() => {
    ensureSession().catch(() => {});
  });
}

export const supabase = baseSupabase;

// Re-export all types so users don't need @supabase/supabase-js directly
export * from '@supabase/supabase-js';

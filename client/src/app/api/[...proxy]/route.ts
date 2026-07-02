import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Strip BOM and zero-width chars injected by Windows stdin piping.
// Priority: BACKEND_URL (server-only) -> NEXT_PUBLIC_API_URL -> localhost fallback.
function sanitizeUrl(val: string | undefined): string {
  return (val ?? '').replace(/[\uFEFF\u200B-\u200D]/g, '').trim().replace(/\/+$/, '');
}
const RAW_BACKEND = sanitizeUrl(process.env.BACKEND_URL) || sanitizeUrl(process.env.NEXT_PUBLIC_API_URL);
const BACKEND_URL = (RAW_BACKEND || 'http://localhost:5000').replace(/\/api\/?$/, '');

// Printed once at module init -- visible in Vercel Runtime Logs.
console.log('[PROXY INIT] process.env.BACKEND_URL        :', process.env.BACKEND_URL ?? '(not set)');
console.log('[PROXY INIT] process.env.NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL ?? '(not set)');
console.log('[PROXY INIT] BACKEND_URL (sanitized)        :', BACKEND_URL);
console.log('[PROXY INIT] Sample target URL              :', `${BACKEND_URL}/api/auth/login`);
if (BACKEND_URL === 'http://localhost:5000') {
  console.warn('[PROXY WARN] BACKEND_URL tidak di-set di Vercel env vars! Semua proxy request AKAN GAGAL di production.');
}

function buildUrl(backend: string, path: string, search = ''): string {
  return `${backend}/api/${path}${search}`;
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  if (auth) h['Authorization'] = auth;
  return h;
}

// Multipart uploads (file forms) must be forwarded raw — never re-encoded as JSON text,
// which would corrupt the boundary-delimited binary body.
function isMultipart(req: NextRequest): boolean {
  return (req.headers.get('content-type') || '').startsWith('multipart/form-data');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path);
  console.log(`[PROXY] POST ${targetUrl} -- auth:${!!req.headers.get('authorization')}`);

  if (isMultipart(req)) {
    try {
      const buffer = await req.arrayBuffer();
      const contentType = req.headers.get('content-type')!;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType, ...forwardHeaders(req) },
        body: buffer,
        signal: AbortSignal.timeout(25000),
      });
      console.log(`[PROXY] POST (multipart) ${targetUrl} -> ${res.status}`);
      const resText = await res.text();
      let data: unknown = {};
      try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
      console.error(`[PROXY] POST (multipart) ${targetUrl} FAILED:`, msg);
      return NextResponse.json({ success: false, message: msg }, { status: 503 });
    }
  }

  const text = await req.text();
  const body = text || '{}';
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body,
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[PROXY] POST ${targetUrl} -> ${res.status}`);
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    console.error(`[PROXY] POST ${targetUrl} FAILED:`, msg);
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path);
  const text = await req.text();
  console.log(`[PROXY] PUT ${targetUrl}`);
  try {
    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: text || '{}',
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[PROXY] PUT ${targetUrl} -> ${res.status}`);
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    console.error(`[PROXY] PUT ${targetUrl} FAILED:`, msg);
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path);
  console.log(`[PROXY] DELETE ${targetUrl}`);
  try {
    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers: forwardHeaders(req),
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[PROXY] DELETE ${targetUrl} -> ${res.status}`);
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    console.error(`[PROXY] DELETE ${targetUrl} FAILED:`, msg);
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path);
  const text = await req.text();
  console.log(`[PROXY] PATCH ${targetUrl}`);
  try {
    const res = await fetch(targetUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: text || '{}',
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[PROXY] PATCH ${targetUrl} -> ${res.status}`);
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    console.error(`[PROXY] PATCH ${targetUrl} FAILED:`, msg);
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

// Paths that return binary (PDF) — must NOT be JSON-encoded
const BINARY_PATHS = ['export-pdf', 'generate-pdf'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path, req.nextUrl.search);
  console.log(`[PROXY] GET ${targetUrl}`);
  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: forwardHeaders(req),
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[PROXY] GET ${targetUrl} -> ${res.status}`);

    // Binary response: stream directly without JSON-encoding (JSON.encode corrupts binary)
    const contentType = res.headers.get('content-type') || '';
    const isBinary = contentType.includes('application/pdf') || BINARY_PATHS.some(p => path.includes(p));
    if (isBinary) {
      const blob = await res.blob();
      return new Response(blob, {
        status: res.status,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="report.pdf"',
        },
      });
    }

    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    console.error(`[PROXY] GET ${targetUrl} FAILED:`, msg);
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// Log env values once at module init so they appear in Vercel runtime logs
console.log('[PROXY INIT] BACKEND_URL env:', process.env.BACKEND_URL ?? '(not set)');
console.log('[PROXY INIT] NEXT_PUBLIC_API_URL env:', process.env.NEXT_PUBLIC_API_URL ?? '(not set)');
console.log('[PROXY INIT] Resolved BACKEND_URL:', BACKEND_URL);

function buildUrl(backend: string, path: string, search = ''): string {
  const base = backend.replace(/\/+$/, ''); // strip trailing slash
  return `${base}/api/${path}${search}`;
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  if (auth) h['Authorization'] = auth;
  return h;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path);
  const text = await req.text();
  const body = text || '{}';
  console.log(`[PROXY] POST ${targetUrl} — auth:${!!req.headers.get('authorization')}`);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body,
    });
    console.log(`[PROXY] POST ${targetUrl} → ${res.status}`);
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
    });
    console.log(`[PROXY] PUT ${targetUrl} → ${res.status}`);
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
    });
    console.log(`[PROXY] DELETE ${targetUrl} → ${res.status}`);
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
    });
    console.log(`[PROXY] PATCH ${targetUrl} → ${res.status}`);
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const targetUrl = buildUrl(BACKEND_URL, path, req.nextUrl.search);
  console.log(`[PROXY] GET ${targetUrl}`);

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: forwardHeaders(req),
    });
    console.log(`[PROXY] GET ${targetUrl} → ${res.status}`);
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

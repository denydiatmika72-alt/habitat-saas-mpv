import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://a11p3qz385lvjh13zc5d7952.145.79.12.170.sslip.io';

export async function POST(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const text = await req.text();
  const body = text ? text : '{}';

  try {
    const res = await fetch(`${BACKEND_URL}/api/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
      },
      body,
    });

    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const text = await req.text();

  try {
    const res = await fetch(`${BACKEND_URL}/api/${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
      },
      body: text || '{}',
    });
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');

  try {
    const res = await fetch(`${BACKEND_URL}/api/${path}`, {
      method: 'DELETE',
      headers: {
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
      },
    });
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const text = await req.text();

  try {
    const res = await fetch(`${BACKEND_URL}/api/${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
      },
      body: text || '{}',
    });
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const search = req.nextUrl.search;

  try {
    const res = await fetch(`${BACKEND_URL}/api/${path}${search}`, {
      cache: 'no-store',
      headers: {
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
      },
    });
    const resText = await res.text();
    let data: unknown = {};
    try { data = resText ? JSON.parse(resText) : {}; } catch { data = { message: resText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backend tidak dapat dijangkau.';
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }
}

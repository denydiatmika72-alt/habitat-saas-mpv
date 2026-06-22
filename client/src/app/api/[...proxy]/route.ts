import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://a11p3qz385lvjh13zc5d7952.145.79.12.170.sslip.io';

export async function POST(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  const body = await req.json();
  
  const res = await fetch(`${BACKEND_URL}/api/${path}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
    },
    body: JSON.stringify(body),
  });
  
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const { proxy } = await params;
  const path = proxy.join('/');
  
  const res = await fetch(`${BACKEND_URL}/api/${path}`, {
    headers: {
      ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization')! } : {})
    },
  });
  
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

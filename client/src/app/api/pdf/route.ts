import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// GET /api/pdf?path=/public/invoices/xxx.pdf
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'path param required' }, { status: 400 });
  }

  const url = `${BACKEND_URL}${filePath}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filePath.split('/').pop()}"`,
    },
  });
}

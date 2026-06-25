import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('Authorization') || ''

  const base = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
  const backendUrl = `${base}/api/po/${id}/pdf`

  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: token,
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Gagal mengambil PDF' },
        { status: response.status }
      )
    }

    const pdfBuffer = await response.arrayBuffer()

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${id}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[PDF Proxy Error]', err)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}

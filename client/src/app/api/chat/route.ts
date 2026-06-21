import { NextRequest, NextResponse } from 'next/server';

// ─── Sanitizer: Remove unpaired UTF-16 surrogate characters ──────────────────
// Unpaired surrogates (e.g. lone \uD800–\uDBFF or \uDC00–\uDFFF) cause
// JSON.stringify() to throw "invalid high surrogate" errors.
// Common source: copy-pasted text from mobile apps, emoji sequences.
function sanitizeForJSON(str: unknown): unknown {
  if (typeof str !== 'string') return str;
  // Remove unpaired high surrogates (not followed by low surrogate)
  // and unpaired low surrogates (not preceded by high surrogate)
  return str.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ''
  );
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, system, context } = await req.json();

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, message: 'ANTHROPIC_API_KEY is not configured.' },
        { status: 500 }
      );
    }

    // ── Sanitize all string inputs BEFORE JSON.stringify() ──────────────────
    const sanitizedSystem = sanitizeForJSON(system ?? '') as string;

    const sanitizedMessages = Array.isArray(messages)
      ? messages.map((msg: { role: string; content: unknown }) => ({
          role: msg.role,
          content: sanitizeForJSON(msg.content),
        }))
      : [];

    // Sanitize any injected context/document strings
    const sanitizedContext = sanitizeForJSON(context ?? '') as string;

    // If a context string is provided, prepend it to the system prompt
    const finalSystemPrompt = sanitizedContext
      ? `${sanitizedSystem}\n\nKonteks Tambahan:\n${sanitizedContext}`
      : sanitizedSystem;

    // ── Build request body and stringify AFTER sanitizing ────────────────────
    const body = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: finalSystemPrompt,
      messages: sanitizedMessages,
    });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text();
      console.error('[ANTHROPIC API ERROR]', anthropicRes.status, errorText);
      return NextResponse.json(
        { success: false, message: 'Anthropic API error.', detail: errorText },
        { status: anthropicRes.status }
      );
    }

    const data = await anthropicRes.json();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CHAT ROUTE ERROR]', error);
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

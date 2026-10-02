import { NextRequest, NextResponse } from 'next/server';

const MAX_BODY_BYTES = 16 * 1024;

// CSRF defense in depth for cookie-authenticated JSON endpoints. Session cookies are
// SameSite=Lax (Auth.js default), which already blocks cross-site POST/DELETE; this additionally
// rejects any mutating request whose Origin isn't this site, and requires JSON content-type
// (which a plain cross-site <form> can't send).
export function checkMutationOrigin(request: NextRequest): NextResponse | null {
    const origin = request.headers.get('origin');
    if (!origin || origin !== request.nextUrl.origin) {
        // Behind a proxy nextUrl.origin can differ; compare to the Host header as well.
        const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
        let originHost: string | null = null;
        try { originHost = origin ? new URL(origin).host : null; } catch { /* invalid */ }
        if (!originHost || originHost !== host) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    }
    return null;
}

export async function readJsonBody(request: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return { ok: false, res: NextResponse.json({ error: 'Expected application/json' }, { status: 415 }) };
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
        return { ok: false, res: NextResponse.json({ error: 'Request too large' }, { status: 413 }) };
    }
    try {
        return { ok: true, body: JSON.parse(text) };
    } catch {
        return { ok: false, res: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
    }
}

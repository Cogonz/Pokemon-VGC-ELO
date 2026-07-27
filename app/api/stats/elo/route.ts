import { NextRequest, NextResponse } from 'next/server';
import { computePlayerElo } from '@/lib/elo';
import { getAvailableFormats } from '@/lib/formats';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') ?? (await getAvailableFormats()).current;
    const elo = await computePlayerElo(format);
    return NextResponse.json(elo);
}

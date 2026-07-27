import { NextRequest, NextResponse } from 'next/server';
import { computePokemonElo } from '@/lib/pokemon-elo';
import { getAvailableFormats } from '@/lib/formats';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') ?? (await getAvailableFormats()).current;
    const elo = await computePokemonElo(format);
    return NextResponse.json(elo);
}

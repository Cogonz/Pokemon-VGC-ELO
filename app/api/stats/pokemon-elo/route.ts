import { NextRequest, NextResponse } from 'next/server';
import { getPokemonElo } from '@/lib/ratings-store';
import { getAvailableFormats } from '@/lib/formats';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') ?? (await getAvailableFormats()).current;
    const elo = await getPokemonElo(format);
    return NextResponse.json(elo);
}

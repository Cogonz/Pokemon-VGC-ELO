import { NextResponse } from 'next/server';
import { computePokemonElo } from '@/lib/pokemon-elo';

export async function GET() {
    const elo = await computePokemonElo();
    return NextResponse.json(elo);
}

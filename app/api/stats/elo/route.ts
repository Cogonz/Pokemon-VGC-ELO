import { NextResponse } from 'next/server';
import { computePlayerElo } from '@/lib/elo';

export async function GET() {
    const elo = await computePlayerElo();
    return NextResponse.json(elo);
}

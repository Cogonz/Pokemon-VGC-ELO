import { NextResponse } from 'next/server';
import { getPokemonUsage } from '@/lib/stats';

export async function GET() {
    const usage = await getPokemonUsage();
    return NextResponse.json(usage);
}

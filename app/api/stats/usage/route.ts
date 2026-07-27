import { NextRequest, NextResponse } from 'next/server';
import { getPokemonUsage } from '@/lib/stats';
import { getAvailableFormats } from '@/lib/formats';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') ?? (await getAvailableFormats()).current;
    const usage = await getPokemonUsage(format);
    return NextResponse.json(usage);
}

import { prisma } from './prisma';

export interface FormatOption {
    format: string;
    tournaments: number;
}

export interface AvailableFormats {
    options: FormatOption[];
    current: string | null; // format of the most recent ingested tournament
}

// Regulations mix incompatible metagames (different Pokemon legal, different
// rules), so stats should be scoped to one at a time rather than pooled.
// Options come from whatever `format` values are already in our ingested
// data (itself pulled from the Limitless API), not a live external call.
export async function getAvailableFormats(): Promise<AvailableFormats> {
    const rows = await prisma.$queryRaw<{ format: string | null; tournaments: bigint }[]>`
        SELECT format, count(*) AS tournaments
        FROM tournaments
        WHERE format IS NOT NULL
        GROUP BY format
        ORDER BY max(date) DESC NULLS LAST
    `;

    const latest = await prisma.$queryRaw<{ format: string | null }[]>`
        SELECT format
        FROM tournaments
        WHERE format IS NOT NULL
        ORDER BY date DESC NULLS LAST
        LIMIT 1
    `;

    return {
        options: rows.map((r) => ({ format: r.format as string, tournaments: Number(r.tournaments) })),
        current: latest[0]?.format ?? null,
    };
}

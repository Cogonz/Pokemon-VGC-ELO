import { prisma } from './prisma';

// Tournament wins per player: standings rows with placement 1. Ingestion only keeps
// tournaments with 30+ players, so these are real events rather than small side tournaments.
export async function getPlayerTitles(format: string | null): Promise<Map<string, number>> {
    if (format === null) return new Map();
    const rows = await prisma.$queryRaw<{ player: string; titles: bigint }[]>`
        SELECT s.player, count(*) AS titles
        FROM standings s
        JOIN tournaments t ON t.id = s.tournament_id
        WHERE t.format = ${format} AND s.placement = 1
        GROUP BY s.player
    `;
    return new Map(rows.map((r) => [r.player, Number(r.titles)]));
}

import { prisma } from './prisma';

// Tournament wins per player: standings rows with placement 1. Ingestion only keeps
// tournaments with 30+ players, so these are real events rather than small side tournaments.
// A few events report several players tied at placement 1 (no top cut, equal records); those
// have no single winner, so they're not counted.
export async function getPlayerTitles(format: string | null): Promise<Map<string, number>> {
    if (format === null) return new Map();
    const rows = await prisma.$queryRaw<{ player: string; titles: bigint }[]>`
        SELECT s.player, count(*) AS titles
        FROM standings s
        JOIN tournaments t ON t.id = s.tournament_id
        WHERE t.format = ${format} AND s.placement = 1
          AND (SELECT count(*) FROM standings o WHERE o.tournament_id = s.tournament_id AND o.placement = 1) = 1
        GROUP BY s.player
    `;
    return new Map(rows.map((r) => [r.player, Number(r.titles)]));
}

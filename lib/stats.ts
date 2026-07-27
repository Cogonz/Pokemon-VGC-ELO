import { prisma } from './prisma';

export interface PokemonUsage {
    speciesId: string;
    name: string;
    teams: number;
    usagePct: number;
    avgPercentile: number | null; // 0-1, lower = better (closer to 1st place); null if no placement data
}

// Deeper SQL than phase 1: a join across team_pokemon <-> standings with an
// aggregate (AVG percentile, COUNT teams), not just single-table inserts/selects.
//
// Placement is normalized to a percentile (placement / players in that
// tournament) before averaging -- raw placement isn't comparable across
// tournaments ranging from 30 to 4000+ players (2nd place in a 4254-player
// event and 2nd place in a 30-player one aren't the same accomplishment, and
// averaging raw placements let huge tournaments dominate the number into
// something meaningless).
export async function getPokemonUsage(format: string | null, minTeams = 3): Promise<PokemonUsage[]> {
    const totalRows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count
        FROM standings s
        JOIN tournaments t ON t.id = s.tournament_id
        WHERE (${format}::text IS NULL OR t.format = ${format})
    `;
    const totalTeams = Number(totalRows[0]?.count ?? 0);
    if (totalTeams === 0) return [];

    const rows = await prisma.$queryRaw<
        { species_id: string; name: string; teams: bigint; avg_percentile: number | null }[]
    >`
        SELECT tp.species_id,
               MAX(tp.name) AS name,
               COUNT(DISTINCT tp.standing_id) AS teams,
               AVG(CASE WHEN t.players > 0 THEN s.placement::float / t.players END) AS avg_percentile
        FROM team_pokemon tp
        JOIN standings s ON s.id = tp.standing_id
        JOIN tournaments t ON t.id = s.tournament_id
        WHERE (${format}::text IS NULL OR t.format = ${format})
        GROUP BY tp.species_id
        HAVING COUNT(DISTINCT tp.standing_id) >= ${minTeams}
        ORDER BY teams DESC
    `;

    return rows.map((r) => ({
        speciesId: r.species_id,
        name: r.name,
        teams: Number(r.teams),
        usagePct: (Number(r.teams) / totalTeams) * 100,
        avgPercentile: r.avg_percentile != null ? Number(r.avg_percentile) : null,
    }));
}

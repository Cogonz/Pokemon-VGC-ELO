import { prisma } from './prisma';

export interface PokemonUsage {
    speciesId: string;
    name: string;
    teams: number;
    usagePct: number;
    avgPlacement: number | null;
}

// Deeper SQL than phase 1: a join across team_pokemon <-> standings with an
// aggregate (AVG placement, COUNT teams), not just single-table inserts/selects.
export async function getPokemonUsage(minTeams = 3): Promise<PokemonUsage[]> {
    const totalTeams = await prisma.standings.count();
    if (totalTeams === 0) return [];

    const rows = await prisma.$queryRaw<
        { species_id: string; name: string; teams: bigint; avg_placement: number | null }[]
    >`
        SELECT tp.species_id,
               MAX(tp.name) AS name,
               COUNT(DISTINCT tp.standing_id) AS teams,
               AVG(s.placement) AS avg_placement
        FROM team_pokemon tp
        JOIN standings s ON s.id = tp.standing_id
        GROUP BY tp.species_id
        HAVING COUNT(DISTINCT tp.standing_id) >= ${minTeams}
        ORDER BY teams DESC
    `;

    return rows.map((r) => ({
        speciesId: r.species_id,
        name: r.name,
        teams: Number(r.teams),
        usagePct: (Number(r.teams) / totalTeams) * 100,
        avgPlacement: r.avg_placement != null ? Number(r.avg_placement) : null,
    }));
}

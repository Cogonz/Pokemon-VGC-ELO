import { prisma } from './prisma';

// Placement 1 only counts as a win when exactly one player holds it (see lib/titles.ts).
const SOLE_WINNER = `(SELECT count(*) FROM standings o WHERE o.tournament_id = s.tournament_id AND o.placement = 1) = 1`;

export interface PokemonHistory {
    titles: number; // tournaments won by a team carrying this Pokemon
    topCuts: number; // top-8 finishes by teams carrying it (includes the wins)
}

// species_id -> tournament history for one regulation, for the Pokemon tables.
export async function getPokemonHistory(format: string | null): Promise<Map<string, PokemonHistory>> {
    if (format === null) return new Map();
    const rows = await prisma.$queryRawUnsafe<{ species_id: string; titles: bigint; top_cuts: bigint }[]>(
        `SELECT tp.species_id,
                count(DISTINCT s.id) FILTER (WHERE s.placement = 1 AND ${SOLE_WINNER}) AS titles,
                count(DISTINCT s.id) FILTER (WHERE s.placement BETWEEN 1 AND 8) AS top_cuts
         FROM team_pokemon tp
         JOIN standings s ON s.id = tp.standing_id
         JOIN tournaments t ON t.id = s.tournament_id
         WHERE t.format = $1 AND s.placement BETWEEN 1 AND 8
         GROUP BY tp.species_id`,
        format
    );
    return new Map(rows.map((r) => [r.species_id, { titles: Number(r.titles), topCuts: Number(r.top_cuts) }]));
}

export interface UsageEntry {
    label: string;
    teams: number;
    pct: number; // of teams carrying this Pokemon
    impact?: number | null; // Elo points vs this Pokemon's usual items (items only; lib/item-impact.ts)
}

export interface TournamentResult {
    tournament: string;
    date: string | null;
    players: number | null;
    placement: number;
    player: string;
}

export interface PokemonDetail {
    teams: number; // teams in this regulation carrying the Pokemon
    moves: UsageEntry[];
    items: UsageEntry[];
    abilities: UsageEntry[];
    natures: UsageEntry[];
    teras: UsageEntry[];
    teammates: UsageEntry[]; // pct = share of this Pokemon's teams that also run the teammate
    results: TournamentResult[]; // best finishes, wins first
}

type Row = { label: string; n: bigint };

function toEntries(rows: Row[], teams: number): UsageEntry[] {
    return rows
        .filter((r) => r.label && r.label.trim() !== '')
        .map((r) => ({ label: r.label, teams: Number(r.n), pct: teams ? (Number(r.n) / teams) * 100 : 0 }));
}

// Every statistic is "share of this Pokemon's teams": a move at 80% is on 80% of the teams that
// ran the Pokemon, so lists don't sum to 100% (a Pokemon carries four moves).
export async function getPokemonDetail(speciesId: string, format: string): Promise<PokemonDetail | null> {
    const base = prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT tp.standing_id) AS n
        FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id JOIN tournaments t ON t.id = s.tournament_id
        WHERE tp.species_id = ${speciesId} AND t.format = ${format}`;
    const teams = Number((await base)[0]?.n ?? 0);
    if (teams === 0) return null;

    const column = (col: 'item' | 'ability' | 'nature' | 'tera') =>
        prisma.$queryRawUnsafe<Row[]>(
            `SELECT tp.${col} AS label, count(*) AS n
             FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id JOIN tournaments t ON t.id = s.tournament_id
             WHERE tp.species_id = $1 AND t.format = $2
             GROUP BY tp.${col} ORDER BY n DESC`,
            speciesId,
            format
        );

    const [items, abilities, natures, teras, moves, teammates, results, impacts] = await Promise.all([
        column('item'),
        column('ability'),
        column('nature'),
        column('tera'),
        prisma.$queryRaw<Row[]>`
            SELECT m AS label, count(*) AS n
            FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id JOIN tournaments t ON t.id = s.tournament_id,
                 unnest(tp.moves) AS m
            WHERE tp.species_id = ${speciesId} AND t.format = ${format}
            GROUP BY m ORDER BY n DESC LIMIT 16`,
        prisma.$queryRaw<Row[]>`
            SELECT mate.name AS label, count(DISTINCT mate.standing_id) AS n
            FROM team_pokemon tp
            JOIN team_pokemon mate ON mate.standing_id = tp.standing_id AND mate.species_id <> tp.species_id
            JOIN standings s ON s.id = tp.standing_id JOIN tournaments t ON t.id = s.tournament_id
            WHERE tp.species_id = ${speciesId} AND t.format = ${format}
            GROUP BY mate.name ORDER BY n DESC LIMIT 12`,
        prisma.$queryRaw<
            { tournament: string; date: Date | null; players: number | null; placement: number; player: string }[]
        >`
            SELECT t.name AS tournament, t.date, t.players, s.placement, s.name AS player
            FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id JOIN tournaments t ON t.id = s.tournament_id
            WHERE tp.species_id = ${speciesId} AND t.format = ${format} AND s.placement BETWEEN 1 AND 4
            ORDER BY s.placement ASC, t.players DESC NULLS LAST, t.date DESC NULLS LAST
            LIMIT 15`,
        prisma.item_impact.findMany({ where: { format, species_id: speciesId } }),
    ]);
    const impactByItem = new Map(impacts.map((r) => [r.item, r.impact]));

    return {
        teams,
        moves: toEntries(moves, teams),
        items: toEntries(items, teams)
            .slice(0, 12)
            .map((e) => ({ ...e, impact: impactByItem.get(e.label) ?? null })),
        abilities: toEntries(abilities, teams).slice(0, 6),
        natures: toEntries(natures, teams).slice(0, 6),
        teras: toEntries(teras, teams).slice(0, 8),
        teammates: toEntries(teammates, teams),
        results: results.map((r) => ({ ...r, date: r.date ? r.date.toISOString().slice(0, 10) : null })),
    };
}

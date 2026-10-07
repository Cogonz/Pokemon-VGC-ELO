import { prisma } from './prisma';
import { getAvailableFormats } from './formats';
import { computePlayerElo, type PlayerElo } from './elo';
import { computePokemonElo, type PokemonElo } from './pokemon-elo';
import { computePlayerBonuses, computePokemonBonuses } from './results';
import { computeAttributeImpacts, type AttributeImpactRow } from './attribute-impact';

// The joint Pokemon regression and the player Elo replay both scan every
// match for a regulation, which is too much work (and too many rows pulled
// over the wire) to repeat on each serverless request. Ingestion computes
// them once per format and stores the results here; page/API requests only
// read these tables.

const INSERT_CHUNK = 5000;

function chunk<T>(rows: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) out.push(rows.slice(i, i + INSERT_CHUNK));
    return out;
}

// Recomputes ratings for every ingested format and replaces the stored tables
// atomically, so readers never see a half-written state.
export async function refreshRatings(): Promise<void> {
    const { options } = await getAvailableFormats();

    const pokemonRows: { format: string; species_id: string; name: string; rating: number; wins: number; losses: number; ties: number; matches: number; result_bonus: number }[] = [];
    const playerRows: { format: string; player: string; name: string; rating: number; wins: number; losses: number; ties: number; result_bonus: number }[] = [];

    const attributeRows: (AttributeImpactRow & { format: string })[] = [];

    for (const { format } of options) {
        for (const r of await computeAttributeImpacts(format)) attributeRows.push({ format, ...r });
        const [pokemonBonus, playerBonus] = await Promise.all([computePokemonBonuses(format), computePlayerBonuses(format)]);
        for (const p of await computePokemonElo(format)) {
            pokemonRows.push({
                format,
                species_id: p.speciesId,
                name: p.name,
                rating: p.rating,
                wins: p.wins,
                losses: p.losses,
                ties: p.ties,
                matches: p.matches,
                result_bonus: pokemonBonus.get(p.speciesId) ?? 0,
            });
        }
        for (const p of await computePlayerElo(format)) {
            playerRows.push({ format, player: p.player, name: p.name, rating: p.rating, wins: p.wins, losses: p.losses, ties: p.ties, result_bonus: playerBonus.get(p.player) ?? 0 });
        }
    }

    await prisma.$transaction([
        prisma.pokemon_elo.deleteMany(),
        prisma.player_elo.deleteMany(),
        prisma.attribute_impact.deleteMany(),
        ...chunk(pokemonRows).map((data) => prisma.pokemon_elo.createMany({ data })),
        ...chunk(playerRows).map((data) => prisma.player_elo.createMany({ data })),
        ...chunk(attributeRows).map((data) => prisma.attribute_impact.createMany({ data })),
    ]);

    console.log(`[ratings] stored ${pokemonRows.length} pokemon ratings and ${playerRows.length} player ratings and ${attributeRows.length} attribute impacts across ${options.length} format(s)`);
}

// Stored ratings split into match Elo and the tournament-results bonus. `rating` is the combined
// value the site shows by default; `matchRating` is match Elo alone (for the "include tournament
// results" toggle).
export type PokemonRating = PokemonElo & { matchRating: number; resultBonus: number };
export type PlayerRating = PlayerElo & { matchRating: number; resultBonus: number };

export async function getPokemonElo(format: string | null): Promise<PokemonRating[]> {
    if (format === null) return [];
    const rows = await prisma.pokemon_elo.findMany({ where: { format } });
    return rows
        .map((r) => ({
            speciesId: r.species_id,
            name: r.name,
            rating: r.rating + r.result_bonus,
            matchRating: r.rating,
            resultBonus: r.result_bonus,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            matches: r.matches,
        }))
        .sort((a, b) => b.rating - a.rating || a.speciesId.localeCompare(b.speciesId));
}

export async function getPlayerElo(format: string | null): Promise<PlayerRating[]> {
    if (format === null) return [];
    const rows = await prisma.player_elo.findMany({ where: { format } });
    return rows
        .map((r) => ({
            player: r.player,
            name: r.name,
            rating: r.rating + r.result_bonus,
            matchRating: r.rating,
            resultBonus: r.result_bonus,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
        }))
        .sort((a, b) => b.rating - a.rating || a.player.localeCompare(b.player));
}

import { prisma } from './prisma';
import { getAvailableFormats } from './formats';
import { computePlayerElo, type PlayerElo } from './elo';
import { computePokemonElo, type PokemonElo } from './pokemon-elo';

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

    const pokemonRows: { format: string; species_id: string; name: string; rating: number; wins: number; losses: number; ties: number; matches: number }[] = [];
    const playerRows: { format: string; player: string; name: string; rating: number; wins: number; losses: number; ties: number }[] = [];

    for (const { format } of options) {
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
            });
        }
        for (const p of await computePlayerElo(format)) {
            playerRows.push({ format, player: p.player, name: p.name, rating: p.rating, wins: p.wins, losses: p.losses, ties: p.ties });
        }
    }

    await prisma.$transaction([
        prisma.pokemon_elo.deleteMany(),
        prisma.player_elo.deleteMany(),
        ...chunk(pokemonRows).map((data) => prisma.pokemon_elo.createMany({ data })),
        ...chunk(playerRows).map((data) => prisma.player_elo.createMany({ data })),
    ]);

    console.log(`[ratings] stored ${pokemonRows.length} pokemon ratings and ${playerRows.length} player ratings across ${options.length} format(s)`);
}

export async function getPokemonElo(format: string | null): Promise<PokemonElo[]> {
    if (format === null) return [];
    const rows = await prisma.pokemon_elo.findMany({ where: { format }, orderBy: [{ rating: 'desc' }, { species_id: 'asc' }] });
    return rows.map((r) => ({
        speciesId: r.species_id,
        name: r.name,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        matches: r.matches,
    }));
}

export async function getPlayerElo(format: string | null): Promise<PlayerElo[]> {
    if (format === null) return [];
    const rows = await prisma.player_elo.findMany({ where: { format }, orderBy: [{ rating: 'desc' }, { player: 'asc' }] });
    return rows.map((r) => ({ player: r.player, name: r.name, rating: r.rating, wins: r.wins, losses: r.losses, ties: r.ties }));
}

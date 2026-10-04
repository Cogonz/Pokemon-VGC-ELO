import type { PlayerElo } from './elo';
import type { PokemonElo } from './pokemon-elo';
import type { PokemonUsage } from './stats';
import type { PokemonRow } from '@/components/PokemonTable';

export const MIN_ELO_MATCHES = 3; // players below this aren't ranked (but are still searchable)
export const MIN_POKEMON_ELO_MATCHES = 15; // Pokemon below this are hidden from the Elo leaderboard

export type PlayerSort = 'elo' | 'matches' | 'record';
export const PLAYER_SORTS: Record<PlayerSort, string> = { elo: 'Elo', matches: 'Total matches', record: 'W-L record' };

export const games = (p: { wins: number; losses: number; ties: number }) => p.wins + p.losses + p.ties;

// Lowercase + strip accents so "Pokemon"/"Pokémon" style differences never hide a match.
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Record sort is shrunk toward 50% (as if each player had 5 extra wins and 5 extra losses),
// so a 9-0 sample doesn't outrank a long strong record.
const COMPARE: Record<PlayerSort, (a: PlayerElo, b: PlayerElo) => number> = {
    elo: (a, b) => b.rating - a.rating,
    matches: (a, b) => games(b) - games(a),
    record: (a, b) => (b.wins + 5) / (games(b) + 10) - (a.wins + 5) / (games(a) + 10) || games(b) - games(a),
};

export function sortPlayers(players: PlayerElo[], sort: PlayerSort): PlayerElo[] {
    return [...players].sort((a, b) => COMPARE[sort](a, b) || a.name.localeCompare(b.name) || a.player.localeCompare(b.player));
}

export function isPlayerSort(v: string | undefined): v is PlayerSort {
    return v !== undefined && Object.hasOwn(PLAYER_SORTS, v);
}

// Joins the Elo and usage datasets by species; either side may be missing for a Pokemon.
export function buildPokemonRows(elo: PokemonElo[], usage: PokemonUsage[]): PokemonRow[] {
    const eloById = new Map(elo.map((p) => [p.speciesId, p]));
    const usageById = new Map(usage.map((u) => [u.speciesId, u]));
    return [...new Set([...eloById.keys(), ...usageById.keys()])].map((id) => {
        const e = eloById.get(id);
        const u = usageById.get(id);
        return {
            speciesId: id,
            name: (e?.name ?? u?.name)!,
            rating: e?.rating ?? null,
            wins: e?.wins ?? 0,
            losses: e?.losses ?? 0,
            ties: e?.ties ?? 0,
            matches: e?.matches ?? 0,
            teams: u?.teams ?? 0,
            usagePct: u?.usagePct ?? 0,
            avgPercentile: u?.avgPercentile ?? null,
        };
    });
}

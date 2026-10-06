import type { PlayerRating as PlayerElo, PokemonRating as PokemonElo } from './ratings-store';
import type { PokemonUsage } from './stats';
import { matchAdjustedScore } from './recommend';
import type { PokemonRow } from '@/components/PokemonTable';

export const MIN_ELO_MATCHES = 3; // players below this aren't ranked (but are still searchable)
export const MIN_POKEMON_ELO_MATCHES = 15; // Pokemon below this are hidden from the Elo leaderboard

export type PlayerSort = 'elo' | 'titles' | 'matches' | 'record';
export const PLAYER_SORTS: Record<PlayerSort, string> = {
    elo: 'Elo',
    titles: 'Tournament wins',
    matches: 'Total matches',
    record: 'W-L record',
};

export const games = (p: { wins: number; losses: number; ties: number }) => p.wins + p.losses + p.ties;

// Lowercase + strip accents so "Pokemon"/"Pokémon" style differences never hide a match.
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Record sort is shrunk toward 50% (as if each player had 5 extra wins and 5 extra losses),
// so a 9-0 sample doesn't outrank a long strong record.
// With `adjusted`, "Elo" ordering uses the match-adjusted rating (lib/recommend.ts) instead of the raw one.
// `results` includes the tournament-results bonus (default); without it, match Elo alone.
export const playerElo = (p: PlayerElo, adjusted: boolean, results = true) => {
    const base = results ? p.rating : p.matchRating;
    return adjusted ? Math.round(matchAdjustedScore(base, games(p))) : base;
};

interface SortContext {
    adjusted: boolean;
    results: boolean;
    titles: Map<string, number>;
}

const titlesOf = (p: PlayerElo, ctx: SortContext) => ctx.titles.get(p.player) ?? 0;

const COMPARE: Record<PlayerSort, (a: PlayerElo, b: PlayerElo, ctx: SortContext) => number> = {
    elo: (a, b, ctx) => playerElo(b, ctx.adjusted, ctx.results) - playerElo(a, ctx.adjusted, ctx.results),
    // Most tournament wins first; Elo breaks ties between players with the same count.
    titles: (a, b, ctx) => titlesOf(b, ctx) - titlesOf(a, ctx) || playerElo(b, ctx.adjusted, ctx.results) - playerElo(a, ctx.adjusted, ctx.results),
    matches: (a, b) => games(b) - games(a),
    record: (a, b) => (b.wins + 5) / (games(b) + 10) - (a.wins + 5) / (games(a) + 10) || games(b) - games(a),
};

export function sortPlayers(
    players: PlayerElo[],
    sort: PlayerSort,
    adjusted = false,
    titles: Map<string, number> = new Map(),
    results = true
): PlayerElo[] {
    const ctx = { adjusted, titles, results };
    return [...players].sort((a, b) => COMPARE[sort](a, b, ctx) || a.name.localeCompare(b.name) || a.player.localeCompare(b.player));
}

export function isPlayerSort(v: string | undefined): v is PlayerSort {
    return v !== undefined && Object.hasOwn(PLAYER_SORTS, v);
}

// Joins the Elo and usage datasets by species; either side may be missing for a Pokemon.
export function buildPokemonRows(
    elo: PokemonElo[],
    usage: PokemonUsage[],
    types: Record<string, { type1: string; type2: string | null }> = {},
    history: Map<string, { titles: number; topCuts: number }> = new Map()
): PokemonRow[] {
    const eloById = new Map(elo.map((p) => [p.speciesId, p]));
    const usageById = new Map(usage.map((u) => [u.speciesId, u]));
    return [...new Set([...eloById.keys(), ...usageById.keys()])].map((id) => {
        const e = eloById.get(id);
        const u = usageById.get(id);
        return {
            speciesId: id,
            name: (e?.name ?? u?.name)!,
            rating: e?.rating ?? null,
            matchRating: e?.matchRating ?? null,
            resultBonus: e?.resultBonus ?? 0,
            wins: e?.wins ?? 0,
            losses: e?.losses ?? 0,
            ties: e?.ties ?? 0,
            matches: e?.matches ?? 0,
            teams: u?.teams ?? 0,
            usagePct: u?.usagePct ?? 0,
            avgPercentile: u?.avgPercentile ?? null,
            titles: history.get(id)?.titles ?? 0,
            topCuts: history.get(id)?.topCuts ?? 0,
            type1: types[id]?.type1 ?? null,
            type2: types[id]?.type2 ?? null,
        };
    });
}

import { prisma } from './prisma';

export interface PokemonElo {
    speciesId: string;
    name: string;
    rating: number;
    wins: number;
    losses: number;
    ties: number;
    matches: number;
}

interface MatchRow {
    tournament_id: string;
    player1: string;
    player2: string;
    winner: string | null;
}

interface TeamRow {
    tournament_id: string;
    player: string;
    species_id: string;
    name: string;
}

interface PokemonRecord {
    wins: number;
    losses: number;
    ties: number;
    matches: number;
}

// Team-level Elo attributed down to individual Pokemon.
//
// The Limitless API only exposes each player's full registered decklist per
// tournament, never which specific Pokemon were "brought" to an individual
// game -- there's no finer-grained data, so every match a player plays uses
// their whole registered roster as the "general" team.
//
// A Pokemon that appears on BOTH rosters in a match is a mirror: it can't
// explain why one side won *this* match, so it gets an explicit zero rating
// delta from it. But it still reflects real team strength (a shared staple
// makes both sides genuinely stronger), so it's kept in the full-roster
// average used to compute the pre-match expectation -- only the resulting
// delta is restricted to the differentiating (non-shared) Pokemon. Earlier
// this excluded shared Pokemon from the match entirely, which also dropped
// them from the match/win-loss count -- that systematically starved the
// most-used Pokemon (they're mirrored constantly) of both rating signal and
// even a recorded appearance, to the point the highest-usage species in the
// format were missing from the leaderboard outright.
export async function computePokemonElo(k = 32, base = 1500): Promise<PokemonElo[]> {
    const matches = await prisma.$queryRaw<MatchRow[]>`
        SELECT m.tournament_id, m.player1, m.player2, m.winner
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        ORDER BY t.date ASC NULLS LAST, m.phase ASC, m.round ASC, m.id ASC
    `;

    const teamRows = await prisma.$queryRaw<TeamRow[]>`
        SELECT s.tournament_id, s.player, tp.species_id, tp.name
        FROM standings s
        JOIN team_pokemon tp ON tp.standing_id = s.id
    `;

    const rosterKey = (tournamentId: string, player: string) => `${tournamentId}:${player}`;
    const rosters = new Map<string, Set<string>>();
    const nameBySpecies = new Map<string, string>();
    for (const row of teamRows) {
        const key = rosterKey(row.tournament_id, row.player);
        let roster = rosters.get(key);
        if (!roster) {
            roster = new Set();
            rosters.set(key, roster);
        }
        roster.add(row.species_id);
        nameBySpecies.set(row.species_id, row.name);
    }

    const rating = new Map<string, number>();
    const record = new Map<string, PokemonRecord>();
    const getRecord = (species: string): PokemonRecord => {
        let r = record.get(species);
        if (!r) {
            r = { wins: 0, losses: 0, ties: 0, matches: 0 };
            record.set(species, r);
        }
        return r;
    };

    const avg = (species: string[]) =>
        species.reduce((sum, s) => sum + (rating.get(s) ?? base), 0) / species.length;

    for (const m of matches) {
        const rosterA = rosters.get(rosterKey(m.tournament_id, m.player1));
        const rosterB = rosters.get(rosterKey(m.tournament_id, m.player2));
        if (!rosterA || !rosterB || rosterA.size === 0 || rosterB.size === 0) continue;

        const teamA = [...rosterA];
        const teamB = [...rosterB];
        const uniqueA = teamA.filter((s) => !rosterB.has(s));
        const uniqueB = teamB.filter((s) => !rosterA.has(s));
        const sA = m.winner === null ? 0.5 : m.winner === m.player1 ? 1 : 0;

        // Every Pokemon on either roster "played" this match -- record that
        // appearance and the team's actual result, even for shared/mirrored
        // Pokemon, so heavily-mirrored staples don't disappear from the
        // match count just because they rarely swing an individual game.
        for (const species of teamA) {
            const rec = getRecord(species);
            rec.matches++;
            if (sA === 0.5) rec.ties++;
            else if (sA === 1) rec.wins++;
            else rec.losses++;
        }
        for (const species of teamB) {
            const rec = getRecord(species);
            rec.matches++;
            if (sA === 0.5) rec.ties++;
            else if (sA === 0) rec.wins++;
            else rec.losses++;
        }

        if (uniqueA.length === 0 || uniqueB.length === 0) continue; // fully mirrored -- no differentiating signal

        // Full-roster averages (including shared Pokemon) drive the pre-match
        // expectation -- a shared staple still reflects real team strength,
        // it just can't explain why one side won *this* game.
        const ratingA = avg(teamA);
        const ratingB = avg(teamB);
        const eA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));

        const deltaA = k * (sA - eA);
        const deltaB = -deltaA;

        // Only the differentiating (non-shared) Pokemon absorb the rating
        // change -- a shared Pokemon nets exactly zero from this match
        // rather than being excluded from it altogether.
        for (const species of uniqueA) {
            rating.set(species, (rating.get(species) ?? base) + deltaA);
        }
        for (const species of uniqueB) {
            rating.set(species, (rating.get(species) ?? base) + deltaB);
        }
    }

    return [...record.entries()]
        .map(([speciesId, rec]) => ({
            speciesId,
            name: nameBySpecies.get(speciesId) ?? speciesId,
            rating: Math.round(rating.get(speciesId) ?? base),
            wins: rec.wins,
            losses: rec.losses,
            ties: rec.ties,
            matches: rec.matches,
        }))
        .sort((a, b) => b.rating - a.rating);
}

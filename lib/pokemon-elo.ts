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
// A Pokemon that appears on BOTH rosters in a match is a mirror -- it didn't
// distinguish the two teams, so it's excluded entirely from that match's
// rating update. That guarantees an exact net-zero effect, rather than
// relying on offsetting deltas that only cancel out algebraically.
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

    for (const m of matches) {
        const rosterA = rosters.get(rosterKey(m.tournament_id, m.player1));
        const rosterB = rosters.get(rosterKey(m.tournament_id, m.player2));
        if (!rosterA || !rosterB || rosterA.size === 0 || rosterB.size === 0) continue;

        const uniqueA = [...rosterA].filter((s) => !rosterB.has(s));
        const uniqueB = [...rosterB].filter((s) => !rosterA.has(s));
        if (uniqueA.length === 0 || uniqueB.length === 0) continue; // fully mirrored -- no signal either way

        const avg = (species: string[]) =>
            species.reduce((sum, s) => sum + (rating.get(s) ?? base), 0) / species.length;
        const ratingA = avg(uniqueA);
        const ratingB = avg(uniqueB);
        const eA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
        const sA = m.winner === null ? 0.5 : m.winner === m.player1 ? 1 : 0;

        const deltaA = k * (sA - eA);
        const deltaB = -deltaA;

        for (const species of uniqueA) {
            rating.set(species, (rating.get(species) ?? base) + deltaA);
            const rec = getRecord(species);
            rec.matches++;
            if (sA === 0.5) rec.ties++;
            else if (sA === 1) rec.wins++;
            else rec.losses++;
        }
        for (const species of uniqueB) {
            rating.set(species, (rating.get(species) ?? base) + deltaB);
            const rec = getRecord(species);
            rec.matches++;
            if (sA === 0.5) rec.ties++;
            else if (sA === 1) rec.losses++;
            else rec.wins++;
        }
    }

    return [...rating.entries()]
        .map(([speciesId, r]) => {
            const rec = getRecord(speciesId);
            return {
                speciesId,
                name: nameBySpecies.get(speciesId) ?? speciesId,
                rating: Math.round(r),
                wins: rec.wins,
                losses: rec.losses,
                ties: rec.ties,
                matches: rec.matches,
            };
        })
        .sort((a, b) => b.rating - a.rating);
}

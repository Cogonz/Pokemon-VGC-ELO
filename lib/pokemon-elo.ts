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

interface TrainingExample {
    uniqueA: number[]; // species indices with feature +1 (unique to the winning-side-perspective team A)
    uniqueB: number[]; // species indices with feature -1
    y: number; // 1 = A won, 0 = B won, 0.5 = tie
}

const ELO_SCALE = 400 / Math.LN10; // converts natural-log-odds coefficients to standard 400-point Elo scale
// Ridge strength, in the same (unnormalized, summed-over-examples) units as the data
// gradient. Fisher information for a +-1 feature is ~0.25 per differentiating
// appearance at p=0.5, so lambda=40 gives roughly half signal-retention at ~150
// appearances and near-full retention once a species has thousands.
const L2_LAMBDA = 40;
const LEARNING_RATE = 0.1;
const EPOCHS = 400;

function sigmoid(z: number): number {
    if (z >= 0) {
        const ez = Math.exp(-z);
        return 1 / (1 + ez);
    }
    const ez = Math.exp(z);
    return ez / (1 + ez);
}

// Fits one coefficient per Pokemon via L2-regularized logistic regression
// (the "adjusted plus-minus" method sports analytics uses to credit
// individuals from team outcomes), instead of sequential per-match Elo
// updates. Each match is one training row: a Pokemon unique to the winning-
// perspective team is +1, unique to the other team is -1, and a Pokemon on
// BOTH rosters (a mirror) is 0 -- it contributes nothing to that row at all,
// so mirrors cancel out by construction rather than needing to be special-
// cased. Because every species' coefficient is fit jointly over the whole
// match history in one convex optimization, there's no live feedback loop
// between a Pokemon's rating and its teammates' evolving ratings -- which is
// what made an earlier sequential leave-one-out attempt diverge (see git
// history). The L2 penalty pulls small-sample coefficients toward 0 (rating
// 1500), replacing the separate post-hoc shrinkage formula the sequential
// version needed.
export async function computePokemonElo(base = 1500): Promise<PokemonElo[]> {
    const matches = await prisma.$queryRaw<MatchRow[]>`
        SELECT m.tournament_id, m.player1, m.player2, m.winner
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
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

    const record = new Map<string, PokemonRecord>();
    const getRecord = (species: string): PokemonRecord => {
        let r = record.get(species);
        if (!r) {
            r = { wins: 0, losses: 0, ties: 0, matches: 0 };
            record.set(species, r);
        }
        return r;
    };

    const speciesIndex = new Map<string, number>();
    const indexOf = (species: string): number => {
        let i = speciesIndex.get(species);
        if (i === undefined) {
            i = speciesIndex.size;
            speciesIndex.set(species, i);
        }
        return i;
    };

    const examples: TrainingExample[] = [];

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

        examples.push({
            uniqueA: uniqueA.map(indexOf),
            uniqueB: uniqueB.map(indexOf),
            y: sA,
        });
    }

    const n = speciesIndex.size;
    const theta = new Float64Array(n);
    const m1 = new Float64Array(n); // Adam first moment
    const v1 = new Float64Array(n); // Adam second moment
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const N = examples.length;

    let loss = Infinity;
    for (let epoch = 1; epoch <= EPOCHS; epoch++) {
        const grad = new Float64Array(n);
        let epochLoss = 0;

        for (const ex of examples) {
            let z = 0;
            for (const i of ex.uniqueA) z += theta[i];
            for (const i of ex.uniqueB) z -= theta[i];
            const p = sigmoid(z);
            const err = p - ex.y; // summed (unnormalized) cross-entropy gradient contribution

            for (const i of ex.uniqueA) grad[i] += err;
            for (const i of ex.uniqueB) grad[i] -= err;

            const pClamped = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
            epochLoss += -(ex.y * Math.log(pClamped) + (1 - ex.y) * Math.log(1 - pClamped));
        }

        for (let i = 0; i < n; i++) grad[i] += L2_LAMBDA * theta[i];
        for (let i = 0; i < n; i++) epochLoss += (L2_LAMBDA / 2) * theta[i] * theta[i];

        for (let i = 0; i < n; i++) {
            m1[i] = beta1 * m1[i] + (1 - beta1) * grad[i];
            v1[i] = beta2 * v1[i] + (1 - beta2) * grad[i] * grad[i];
            const mHat = m1[i] / (1 - beta1 ** epoch);
            const vHat = v1[i] / (1 - beta2 ** epoch);
            theta[i] -= (LEARNING_RATE * mHat) / (Math.sqrt(vHat) + eps);
        }

        if (!Number.isFinite(epochLoss)) {
            throw new Error(`Pokemon Elo regression diverged at epoch ${epoch} (loss=${epochLoss})`);
        }
        loss = epochLoss;
    }

    console.log(`[pokemon-elo] trained on ${N} matches, ${n} species, final loss=${loss.toFixed(1)}`);

    return [...record.entries()]
        .map(([speciesId, rec]) => {
            const i = speciesIndex.get(speciesId);
            const coefficient = i === undefined ? 0 : theta[i];
            return {
                speciesId,
                name: nameBySpecies.get(speciesId) ?? speciesId,
                rating: Math.round(base + coefficient * ELO_SCALE),
                wins: rec.wins,
                losses: rec.losses,
                ties: rec.ties,
                matches: rec.matches,
            };
        })
        .sort((a, b) => b.rating - a.rating);
}

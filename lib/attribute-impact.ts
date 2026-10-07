import { prisma } from './prisma';

// Attribute impact: how much a Pokemon's held item, ability, nature or move changes the result,
// in Elo points, relative to that Pokemon's usual choices for the same attribute.
//
// One joint, L2-regularized logistic regression per regulation over every match (the same
// "adjusted plus-minus" approach as lib/pokemon-elo.ts). Each match is a training row with
// these features, +1 for the first player's side and -1 for the other:
//   - species              the Pokemon itself (so an attribute isn't credited for its holder simply being strong)
//   - species+attribute    "Incineroar holding Sitrus Berry", "Incineroar with Parting Shot", ... (the effects we want)
//   - player               who is playing (so strong players' habits aren't mistaken for attribute effects)
// Items, abilities, natures and moves are fit TOGETHER so each is controlled for the others (a Choice
// Scarf is not credited for the Jolly nature that usually comes with it). A feature present on BOTH
// sides cancels to zero for that row. Rosters are registered per tournament, so we don't know which
// four of six were brought; as elsewhere, the whole registered team is credited.
//
// A pair's coefficient alone is confounded with its species' coefficient (a Pokemon always has one
// item, and always four moves), so the reported impact is the pair's coefficient minus the team-weighted
// average coefficient across that species' values of the same attribute: "this one vs the typical one".
// Attributes a Pokemon almost always has (>= ~97% of its teams) have no comparison group and are not
// reported.

export type AttributeKind = 'item' | 'ability' | 'nature' | 'move';

export const ELO_SCALE = 400 / Math.LN10;
const SPECIES_LAMBDA = 40;
const PAIR_LAMBDA = 80; // the effects of interest are sparse, so shrink them harder
const PLAYER_LAMBDA = 1; // weak: skill must be absorbed by players, not leak into items (checked on synthetic data)
const BRACKET_WEIGHT = 1.5;
const LEARNING_RATE = 0.1;
const MIN_EPOCHS = 20;
const MAX_EPOCHS = 600;
const CONVERGENCE_THRESHOLD = 1e-5;
export const MIN_TEAMS_STORED = 5;

export interface Features {
    species: number[];
    pairs: number[];
    players: number[];
}

export interface FitResult {
    species: Float64Array;
    pairs: Float64Array;
    players: Float64Array;
}

function sigmoid(z: number): number {
    if (z >= 0) return 1 / (1 + Math.exp(-z));
    const ez = Math.exp(z);
    return ez / (1 + ez);
}

// Pure fitting routine (exported so it can be checked against synthetic data).
export function fitModel(
    examples: { plus: Features; minus: Features; y: number; weight: number }[],
    sizes: { species: number; pairs: number; players: number }
): FitResult {
    const nS = sizes.species;
    const nP = sizes.pairs;
    const nQ = sizes.players;
    const n = nS + nP + nQ;
    const lambda = new Float64Array(n);
    lambda.fill(SPECIES_LAMBDA, 0, nS);
    lambda.fill(PAIR_LAMBDA, nS, nS + nP);
    lambda.fill(PLAYER_LAMBDA, nS + nP, n);

    // Flatten each example into one signed index list for a fast inner loop.
    const idx: Int32Array[] = [];
    const sign: Int8Array[] = [];
    const y: number[] = [];
    const w: number[] = [];
    for (const ex of examples) {
        const all: number[] = [];
        const sg: number[] = [];
        const push = (f: Features, s: number) => {
            for (const i of f.species) (all.push(i), sg.push(s));
            for (const i of f.pairs) (all.push(nS + i), sg.push(s));
            for (const i of f.players) (all.push(nS + nP + i), sg.push(s));
        };
        push(ex.plus, 1);
        push(ex.minus, -1);
        idx.push(Int32Array.from(all));
        sign.push(Int8Array.from(sg));
        y.push(ex.y);
        w.push(ex.weight);
    }

    const theta = new Float64Array(n);
    const m1 = new Float64Array(n);
    const v1 = new Float64Array(n);
    const beta1 = 0.9;
    const beta2 = 0.999;

    for (let epoch = 1; epoch <= MAX_EPOCHS; epoch++) {
        const grad = new Float64Array(n);
        for (let e = 0; e < idx.length; e++) {
            const ii = idx[e];
            const ss = sign[e];
            let z = 0;
            for (let k = 0; k < ii.length; k++) z += ss[k] * theta[ii[k]];
            const err = (sigmoid(z) - y[e]) * w[e];
            for (let k = 0; k < ii.length; k++) grad[ii[k]] += ss[k] * err;
        }
        let maxStep = 0;
        for (let i = 0; i < n; i++) {
            grad[i] += lambda[i] * theta[i];
            m1[i] = beta1 * m1[i] + (1 - beta1) * grad[i];
            v1[i] = beta2 * v1[i] + (1 - beta2) * grad[i] * grad[i];
            const step = (LEARNING_RATE * (m1[i] / (1 - beta1 ** epoch))) / (Math.sqrt(v1[i] / (1 - beta2 ** epoch)) + 1e-8);
            theta[i] -= step;
            if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
        }
        if (!Number.isFinite(maxStep)) throw new Error(`Item impact regression diverged at epoch ${epoch}`);
        if (epoch >= MIN_EPOCHS && maxStep < CONVERGENCE_THRESHOLD) break;
    }

    return {
        species: theta.slice(0, nS),
        pairs: theta.slice(nS, nS + nP),
        players: theta.slice(nS + nP),
    };
}

// impact (Elo points) per pair = coefficient - team-weighted mean coefficient of its species' pairs.
export function attributeImpacts(
    pairCoef: Float64Array,
    pairs: { species: string; kind: AttributeKind; teams: number }[]
): number[] {
    const sum = new Map<string, number>();
    const tot = new Map<string, number>();
    pairs.forEach((p, i) => {
        const g = `${p.species}\u0000${p.kind}`;
        sum.set(g, (sum.get(g) ?? 0) + pairCoef[i] * p.teams);
        tot.set(g, (tot.get(g) ?? 0) + p.teams);
    });
    return pairs.map((p, i) => {
        const g = `${p.species}\u0000${p.kind}`;
        return Math.round((pairCoef[i] - sum.get(g)! / tot.get(g)!) * ELO_SCALE);
    });
}

export interface AttributeImpactRow {
    species_id: string;
    kind: AttributeKind;
    value: string;
    teams: number;
    impact: number;
}

const UBIQUITOUS_SHARE = 0.97;

export async function computeAttributeImpacts(format: string): Promise<AttributeImpactRow[]> {
    const [matches, team] = await Promise.all([
        prisma.$queryRaw<{ tournament_id: string; player1: string; player2: string; winner: string | null; phase: number }[]>`
            SELECT m.tournament_id, m.player1, m.player2, m.winner, m.phase
            FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE t.format = ${format}`,
        prisma.$queryRaw<
            { tournament_id: string; player: string; species_id: string; item: string | null; ability: string | null; nature: string | null; moves: string[] | null }[]
        >`
            SELECT s.tournament_id, s.player, tp.species_id, tp.item, tp.ability, tp.nature, tp.moves
            FROM standings s JOIN team_pokemon tp ON tp.standing_id = s.id
            JOIN tournaments t ON t.id = s.tournament_id WHERE t.format = ${format}`,
    ]);

    const speciesIdx = new Map<string, number>();
    const pairIdx = new Map<string, number>();
    const playerIdx = new Map<string, number>();
    const pairInfo: { species: string; kind: AttributeKind; value: string; teams: number }[] = [];
    const speciesTeams = new Map<string, number>();
    const index = (m: Map<string, number>, key: string) => {
        let i = m.get(key);
        if (i === undefined) (i = m.size), m.set(key, i);
        return i;
    };

    // roster per (tournament, player): species set and species+attribute set
    const rosters = new Map<string, { species: Set<number>; pairs: Set<number> }>();
    for (const r of team) {
        const key = `${r.tournament_id}:${r.player}`;
        let ro = rosters.get(key);
        if (!ro) rosters.set(key, (ro = { species: new Set(), pairs: new Set() }));
        ro.species.add(index(speciesIdx, r.species_id));
        speciesTeams.set(r.species_id, (speciesTeams.get(r.species_id) ?? 0) + 1);

        const values: [AttributeKind, string][] = [['item', r.item?.trim() || '(none)']];
        if (r.ability?.trim()) values.push(['ability', r.ability.trim()]);
        if (r.nature?.trim()) values.push(['nature', r.nature.trim()]);
        for (const mv of new Set(r.moves ?? [])) if (mv.trim()) values.push(['move', mv.trim()]);

        for (const [kind, value] of values) {
            const pk = `${kind}\u0000${r.species_id}\u0000${value}`;
            const before = pairIdx.size;
            const pi = index(pairIdx, pk);
            if (pairIdx.size > before) pairInfo.push({ species: r.species_id, kind, value, teams: 0 });
            pairInfo[pi].teams++;
            ro.pairs.add(pi);
        }
    }

    const examples: { plus: Features; minus: Features; y: number; weight: number }[] = [];
    for (const m of matches) {
        const a = rosters.get(`${m.tournament_id}:${m.player1}`);
        const b = rosters.get(`${m.tournament_id}:${m.player2}`);
        if (!a || !b) continue;
        const only = (x: Set<number>, y: Set<number>) => [...x].filter((i) => !y.has(i));
        examples.push({
            plus: { species: only(a.species, b.species), pairs: only(a.pairs, b.pairs), players: [index(playerIdx, m.player1)] },
            minus: { species: only(b.species, a.species), pairs: only(b.pairs, a.pairs), players: [index(playerIdx, m.player2)] },
            y: m.winner === null ? 0.5 : m.winner === m.player1 ? 1 : 0,
            weight: m.phase > 1 ? BRACKET_WEIGHT : 1,
        });
    }
    if (examples.length === 0) return [];

    const fit = fitModel(examples, { species: speciesIdx.size, pairs: pairIdx.size, players: playerIdx.size });
    const impacts = attributeImpacts(fit.pairs, pairInfo);
    console.log(`[attribute-impact] ${format}: ${examples.length} matches, ${pairInfo.length} species+attribute pairs`);

    return pairInfo
        .map((p, i) => ({ species_id: p.species, kind: p.kind, value: p.value, teams: p.teams, impact: impacts[i] }))
        .filter((r) => r.teams >= MIN_TEAMS_STORED && r.teams < (speciesTeams.get(r.species_id) ?? 0) * UBIQUITOUS_SHARE);
}

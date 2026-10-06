import { prisma } from './prisma';

// Tournament results as a rating signal.
//
// Match Elo already reflects who won individual games, but finishing at the top of a large event
// is extra evidence: it means winning many rounds against a strong field, then a bracket. So each
// top finish earns "result points", which become a capped, positive-only Elo bonus. Poor finishes
// never subtract (those games already moved the match Elo).
//
//   points(event) = placementScore(placement) * sizeWeight(players)
//   player bonus  = PLAYER_BONUS_MAX * (1 - exp(-sum(points) / PLAYER_SATURATION))
//
// The exponential keeps the bonus saturating: the first wins matter most, an 18-time winner isn't
// scored 18x a one-time winner, and nobody can get more than PLAYER_BONUS_MAX.
//
// Pokemon: a team's points are credited to each of its six Pokemon. A Pokemon's average points per
// team is compared with the average across ALL teams in the regulation (so a popular Pokemon isn't
// rewarded just for appearing on many teams), shrunk toward that average when few teams back it.

export const PLAYER_BONUS_MAX = 60;
const PLAYER_SATURATION = 3;
export const POKEMON_BONUS_MAX = 25;
const POKEMON_PRIOR_TEAMS = 100; // as if every Pokemon had this many extra average teams
const POKEMON_LIFT_FOR_MAX = 1.0; // relative lift (+100% over the field's average) that earns the max bonus
export const MAX_COUNTED_PLACEMENT = 16;

// Winner 1.0, finalist 0.6, top 4 0.4, top 8 0.25, top 16 0.1.
export function placementScore(placement: number | null): number {
    if (placement == null || placement < 1) return 0;
    if (placement === 1) return 1;
    if (placement === 2) return 0.6;
    if (placement <= 4) return 0.4;
    if (placement <= 8) return 0.25;
    if (placement <= MAX_COUNTED_PLACEMENT) return 0.1;
    return 0;
}

// Bigger fields are harder to win: 30 players ~0.68, 64 = 1.0, 128 ~1.41, capped at 1.5.
export function sizeWeight(players: number): number {
    return Math.min(1.5, Math.sqrt(Math.max(players, 1) / 64));
}

export const eventPoints = (placement: number | null, players: number) => placementScore(placement) * sizeWeight(players);

export function playerBonus(totalPoints: number): number {
    return Math.round(PLAYER_BONUS_MAX * (1 - Math.exp(-totalPoints / PLAYER_SATURATION)));
}

export function pokemonBonus(points: number, teams: number, fieldAvgPoints: number): number {
    if (fieldAvgPoints <= 0) return 0;
    const shrunk = (points + POKEMON_PRIOR_TEAMS * fieldAvgPoints) / (teams + POKEMON_PRIOR_TEAMS);
    const lift = (shrunk - fieldAvgPoints) / fieldAvgPoints;
    return Math.round(Math.max(0, Math.min(1, lift / POKEMON_LIFT_FOR_MAX)) * POKEMON_BONUS_MAX);
}

// player -> bonus for one regulation (events with 30+ players only, which ingestion enforces).
export async function computePlayerBonuses(format: string): Promise<Map<string, number>> {
    const rows = await prisma.$queryRaw<{ player: string; placement: number; players: number }[]>`
        SELECT s.player, s.placement, t.players
        FROM standings s JOIN tournaments t ON t.id = s.tournament_id
        WHERE t.format = ${format} AND s.placement BETWEEN 1 AND ${MAX_COUNTED_PLACEMENT} AND t.players IS NOT NULL`;
    const points = new Map<string, number>();
    for (const r of rows) points.set(r.player, (points.get(r.player) ?? 0) + eventPoints(r.placement, r.players));
    return new Map([...points].map(([player, p]) => [player, playerBonus(p)]));
}

// species_id -> bonus for one regulation.
export async function computePokemonBonuses(format: string): Promise<Map<string, number>> {
    const [teamCounts, totalTeams, tops] = await Promise.all([
        prisma.$queryRaw<{ species_id: string; teams: bigint }[]>`
            SELECT tp.species_id, count(DISTINCT tp.standing_id) AS teams
            FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id
            JOIN tournaments t ON t.id = s.tournament_id
            WHERE t.format = ${format} GROUP BY tp.species_id`,
        prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(DISTINCT tp.standing_id) AS n
            FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id
            JOIN tournaments t ON t.id = s.tournament_id WHERE t.format = ${format}`,
        prisma.$queryRaw<{ standing_id: number; species_id: string; placement: number; players: number }[]>`
            SELECT tp.standing_id, tp.species_id, s.placement, t.players
            FROM team_pokemon tp JOIN standings s ON s.id = tp.standing_id
            JOIN tournaments t ON t.id = s.tournament_id
            WHERE t.format = ${format} AND s.placement BETWEEN 1 AND ${MAX_COUNTED_PLACEMENT} AND t.players IS NOT NULL`,
    ]);

    const teamsTotal = Number(totalTeams[0]?.n ?? 0);
    if (teamsTotal === 0) return new Map();

    const points = new Map<string, number>();
    let fieldPoints = 0;
    const seenTeam = new Set<number>();
    for (const r of tops) {
        const p = eventPoints(r.placement, r.players);
        points.set(r.species_id, (points.get(r.species_id) ?? 0) + p);
        if (!seenTeam.has(r.standing_id)) {
            seenTeam.add(r.standing_id);
            fieldPoints += p; // each team counted once, regardless of its six Pokemon
        }
    }
    const fieldAvg = fieldPoints / teamsTotal;

    const out = new Map<string, number>();
    for (const { species_id, teams } of teamCounts) {
        out.set(species_id, pokemonBonus(points.get(species_id) ?? 0, Number(teams), fieldAvg));
    }
    return out;
}

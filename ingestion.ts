import { StandingsResponse } from './schemas.js';
import { getLimitlessApiKey } from './secrets.js';
import { pool } from './db.js';

// Ingestion from the Limitless TCG API.
// Docs: https://docs.limitlesstcg.com/developer/tournaments

const BASE = 'https://play.limitlesstcg.com/api';
const MIN_PLAYERS = 30; // only tournaments with real attendance are useful for Elo

interface TournamentSummary {
    id: string;
    name: string;
    format?: string;
    date?: string;
    players?: number;
}

async function limitlessGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const apiKey = await getLimitlessApiKey();
    const headers: Record<string, string> = { 'User-Agent': 'vgc-elo/0.1' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
        throw new Error(`Limitless API ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export async function fetchTournaments(): Promise<TournamentSummary[]> {
    return limitlessGet<TournamentSummary[]>('/tournaments', { game: 'VGC', limit: 50 });
}

export async function pickRecentTournament(): Promise<TournamentSummary | undefined> {
    const tournaments = await fetchTournaments();
    return tournaments.find((t) => (t.players ?? 0) >= MIN_PLAYERS) ?? tournaments[0];
}

export async function fetchStandings(tournamentId: string): Promise<StandingsResponse> {
    const raw = await limitlessGet<unknown>(`/tournaments/${tournamentId}/standings`);
    return StandingsResponse.parse(raw);
}

export async function persistTournament(tournament: TournamentSummary, standings: StandingsResponse): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO tournaments (id, name, format, date, players)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET name = $2, format = $3, date = $4, players = $5`,
            [tournament.id, tournament.name, tournament.format ?? null, tournament.date ?? null, tournament.players ?? null]
        );

        for (const s of standings) {
            const { rows } = await client.query<{ id: number }>(
                `INSERT INTO standings (tournament_id, player, name, placement, wins, losses, ties)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (tournament_id, player) DO UPDATE
                     SET name = $3, placement = $4, wins = $5, losses = $6, ties = $7
                 RETURNING id`,
                [tournament.id, s.player, s.name, s.placing, s.record.wins, s.record.losses, s.record.ties]
            );
            const standingId = rows[0].id;

            await client.query('DELETE FROM team_pokemon WHERE standing_id = $1', [standingId]);
            for (const p of s.decklist ?? []) {
                await client.query(
                    `INSERT INTO team_pokemon (standing_id, species_id, name, item, ability, nature, tera, moves)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [standingId, p.id, p.name, p.item ?? null, p.ability ?? null, p.nature ?? null, p.tera ?? null, p.attacks]
                );
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    const tournament = await pickRecentTournament();
    if (!tournament) {
        console.log('No tournaments returned -- check the endpoint/network.');
        return;
    }
    console.log(`Using tournament: ${tournament.name} (id=${tournament.id}, players=${tournament.players})`);

    const standings = await fetchStandings(tournament.id);
    const withTeam = standings.filter((s) => s.decklist && s.decklist.length > 0);
    console.log(`Players returned: ${standings.length}`);
    console.log(`Players with a team list: ${withTeam.length}`);

    await persistTournament(tournament, standings);
    console.log(`Persisted tournament ${tournament.id} to Postgres.`);
    await pool.end();
}

if (import.meta.url.endsWith('/ingestion.ts')) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

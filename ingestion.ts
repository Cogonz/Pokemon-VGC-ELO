import { StandingsResponse, PairingsResponse } from './schemas.js';
import { getLimitlessApiKey } from './secrets.js';
import { pool } from './db.js';

// Ingestion from the Limitless TCG API.
// Docs: https://docs.limitlesstcg.com/developer/tournaments

const BASE = 'https://play.limitlesstcg.com/api';
const MIN_PLAYERS = 30; // only tournaments with real attendance are useful for Elo
const INGEST_COUNT = 100; // Pokemon Elo needs a lot of match history for signal to accumulate per species

interface TournamentSummary {
    id: string;
    name: string;
    format?: string;
    date?: string;
    players?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_DELAY_MS = 400;
const MAX_RETRIES = 5;

async function limitlessGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const apiKey = await getLimitlessApiKey();
    const headers: Record<string, string> = { 'User-Agent': 'vgc-elo/0.1' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        await sleep(REQUEST_DELAY_MS);
        const res = await fetch(url, { headers });
        if (res.status === 429) {
            const retryAfter = Number(res.headers.get('retry-after'));
            const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
            await sleep(backoff);
            continue;
        }
        if (!res.ok) {
            throw new Error(`Limitless API ${path} failed: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
    }
    throw new Error(`Limitless API ${path} failed: rate limited after ${MAX_RETRIES} retries`);
}

export async function fetchTournaments(): Promise<TournamentSummary[]> {
    return limitlessGet<TournamentSummary[]>('/tournaments', { game: 'VGC', limit: 200 });
}

export async function pickRecentTournament(): Promise<TournamentSummary | undefined> {
    const tournaments = await fetchTournaments();
    return tournaments.find((t) => (t.players ?? 0) >= MIN_PLAYERS) ?? tournaments[0];
}

export async function fetchStandings(tournamentId: string): Promise<StandingsResponse> {
    const raw = await limitlessGet<unknown>(`/tournaments/${tournamentId}/standings`);
    return StandingsResponse.parse(raw);
}

export async function fetchPairings(tournamentId: string): Promise<PairingsResponse> {
    const raw = await limitlessGet<unknown>(`/tournaments/${tournamentId}/pairings`);
    return PairingsResponse.parse(raw);
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

export async function persistMatches(tournamentId: string, pairings: PairingsResponse): Promise<number> {
    const client = await pool.connect();
    let stored = 0;
    try {
        await client.query('BEGIN');

        for (const m of pairings) {
            if (!m.player1 || !m.player2) continue; // bye / no-show
            if (m.winner === -1) continue; // double loss -- not a usable result
            const winner = m.winner === 0 ? null : String(m.winner); // null = tie

            await client.query(
                `INSERT INTO matches (tournament_id, phase, round, player1, player2, winner)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (tournament_id, phase, round, player1, player2) DO UPDATE SET winner = $6`,
                [tournamentId, m.phase, m.round, m.player1, m.player2, winner]
            );
            stored++;
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return stored;
}

async function ingestTournament(tournament: TournamentSummary): Promise<void> {
    const standings = await fetchStandings(tournament.id);
    await persistTournament(tournament, standings);

    const pairings = await fetchPairings(tournament.id);
    const stored = await persistMatches(tournament.id, pairings);

    const withTeam = standings.filter((s) => s.decklist && s.decklist.length > 0);
    console.log(
        `  ${tournament.name}: ${standings.length} standings (${withTeam.length} with teams), ${stored} matches`
    );
}

async function main() {
    const tournaments = await fetchTournaments();
    const eligible = tournaments.filter((t) => (t.players ?? 0) >= MIN_PLAYERS);
    const toIngest = (eligible.length > 0 ? eligible : tournaments).slice(0, INGEST_COUNT);

    if (toIngest.length === 0) {
        console.log('No tournaments returned -- check the endpoint/network.');
        return;
    }

    console.log(`Ingesting ${toIngest.length} tournament(s)...`);
    let failed = 0;
    for (const tournament of toIngest) {
        try {
            await ingestTournament(tournament);
        } catch (err) {
            failed++;
            console.error(`  ${tournament.name}: failed -- ${(err as Error).message}`);
        }
    }

    console.log(`Done. Persisted ${toIngest.length - failed}/${toIngest.length} tournament(s) to Postgres.`);
    await pool.end();
}

if (import.meta.url.endsWith('/ingestion.ts')) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

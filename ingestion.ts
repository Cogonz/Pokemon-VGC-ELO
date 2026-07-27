import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StandingsResponse, PairingsResponse } from './schemas.js';
import { getLimitlessApiKey } from './secrets.js';
import { pool } from './db.js';

// Ingestion from the Limitless TCG API.
// Docs: https://docs.limitlesstcg.com/developer/tournaments

const BASE = 'https://play.limitlesstcg.com/api';
const MIN_PLAYERS = 30; // only tournaments with real attendance are useful for Elo
const INGEST_COUNT = 250; // spans several pages of history now that pagination is wired up
const PAGE_SIZE = 200;
const MAX_PAGES = 10; // safety cap; ~50% of tournaments meet MIN_PLAYERS, so INGEST_COUNT=250 needs ~3 pages in practice

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

export async function fetchTournamentsPage(page: number): Promise<TournamentSummary[]> {
    return limitlessGet<TournamentSummary[]>('/tournaments', { game: 'VGC', limit: PAGE_SIZE, page });
}

// Pages back through /tournaments (page 1 = most recent) until `count`
// eligible (MIN_PLAYERS) tournaments are collected, a page comes back empty
// or short (end of data), or MAX_PAGES is hit. Verified empirically that
// `page` returns disjoint, chronologically-continuous ranges (no gaps or
// overlap beyond a single boundary tournament). Used only to seed an empty
// database -- collectNewTournaments is used for every run after that.
export async function collectEligibleTournaments(count: number): Promise<TournamentSummary[]> {
    const eligible: TournamentSummary[] = [];
    let firstPage: TournamentSummary[] = [];

    for (let page = 1; page <= MAX_PAGES && eligible.length < count; page++) {
        const batch = await fetchTournamentsPage(page);
        if (page === 1) firstPage = batch;
        if (batch.length === 0) break;

        eligible.push(...batch.filter((t) => (t.players ?? 0) >= MIN_PLAYERS));
        if (batch.length < PAGE_SIZE) break; // short page -- no more data beyond this
    }

    return (eligible.length > 0 ? eligible : firstPage).slice(0, count);
}

export async function getLatestIngestedDate(): Promise<Date | null> {
    const { rows } = await pool.query<{ max: Date | null }>('SELECT max(date) FROM tournaments');
    return rows[0]?.max ?? null;
}

// Pages back through /tournaments until it reconnects with data already in
// the database (a tournament dated at or before `since`), rather than
// stopping at a fixed count. That guarantees no gap between runs by
// construction -- each run picks up exactly where the last one left off,
// regardless of how many tournaments happened in between -- and skips
// re-fetching standings/pairings for anything already ingested. Returns
// `hitSafetyCap: true` if MAX_PAGES was exhausted before reconnecting (a
// real gap risk, e.g. after a very long gap between runs); the caller
// should surface that rather than silently proceeding.
export async function collectNewTournaments(
    since: Date
): Promise<{ tournaments: TournamentSummary[]; hitSafetyCap: boolean }> {
    const collected: TournamentSummary[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
        const batch = await fetchTournamentsPage(page);
        if (batch.length === 0) return { tournaments: collected, hitSafetyCap: false };

        let reconnected = false;
        for (const t of batch) {
            if ((t.players ?? 0) < MIN_PLAYERS) continue;
            if (t.date && new Date(t.date) <= since) {
                reconnected = true;
                break; // sorted descending -- everything from here on is already ingested
            }
            collected.push(t);
        }

        if (reconnected) return { tournaments: collected, hitSafetyCap: false };
        if (batch.length < PAGE_SIZE) return { tournaments: collected, hitSafetyCap: false }; // ran out of data first
    }

    return { tournaments: collected, hitSafetyCap: true };
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
    const since = await getLatestIngestedDate();
    let toIngest: TournamentSummary[];

    if (since) {
        console.log(`Latest ingested tournament: ${since.toISOString()}. Pulling everything newer...`);
        const result = await collectNewTournaments(since);
        toIngest = result.tournaments;
        if (result.hitSafetyCap) {
            console.warn(
                `  WARNING: hit the ${MAX_PAGES}-page safety cap before reconnecting with existing data -- ` +
                    `there may be a gap. Consider running again (it'll pick up further back from here).`
            );
        }
    } else {
        console.log('No prior data -- seeding with the most recent tournaments.');
        toIngest = await collectEligibleTournaments(INGEST_COUNT);
    }

    if (toIngest.length === 0) {
        console.log('No new tournaments to ingest.');
        await pool.end();
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

// realpathSync on both sides resolves symlinks (e.g. macOS /tmp -> /private/tmp) so this
// correctly distinguishes "run directly" from "imported by another script" -- a plain
// `import.meta.url.endsWith('/ingestion.ts')` check is true in both cases, since it only
// checks which file this is, not whether it's the entry point.
const isMainModule = process.argv[1] != null && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);

if (isMainModule) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

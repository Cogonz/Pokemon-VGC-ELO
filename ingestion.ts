import 'dotenv/config';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StandingsResponse, PairingsResponse } from './schemas.js';
import { pool } from './db.js';
import { prisma } from './lib/prisma.js';
import { refreshRatings } from './lib/ratings-store.js';

// Ingestion from the Limitless TCG API.
// Docs: https://docs.limitlesstcg.com/developer/tournaments

const BASE = 'https://play.limitlesstcg.com/api';
const MIN_PLAYERS = 30; // only tournaments with real attendance are useful for Elo
const INGEST_COUNT = 250; // spans several pages of history now that pagination is wired up
const PAGE_SIZE = 200;
const MAX_PAGES = 10; // safety cap; ~50% of tournaments meet MIN_PLAYERS, so INGEST_COUNT=250 needs ~3 pages in practice
const BACKFILL_MAX_PAGES = 30; // a deliberate --until backfill walks through the already-covered range first

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
const BATCH_SIZE = 1000; // rows per batched INSERT

function* chunked<T>(items: T[], size: number): Generator<T[]> {
    for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

async function limitlessGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const apiKey = process.env.LIMITLESS_API_KEY; // optional; unauthenticated requests work at a lower rate limit
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

export async function getOldestIngestedDate(): Promise<Date | null> {
    const { rows } = await pool.query<{ min: Date | null }>('SELECT min(date) FROM tournaments');
    return rows[0]?.min ?? null;
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

// Deliberately extends history further back than routine runs reach (e.g.
// "backfill to January"), rather than the incremental forward-catching-up
// collectNewTournaments does. Skips everything at or after `beforeDate`
// (the oldest tournament already ingested -- no point re-fetching it),
// collects everything older than that down to `untilDate`, and stops once
// it passes `untilDate` or runs out of page budget. Needs a much larger
// page budget than routine runs since it has to walk through the entire
// already-covered range before reaching new territory.
export async function collectBackfillTournaments(
    beforeDate: Date,
    untilDate: Date,
    maxPages: number
): Promise<{ tournaments: TournamentSummary[]; reachedTarget: boolean }> {
    const collected: TournamentSummary[] = [];

    for (let page = 1; page <= maxPages; page++) {
        const batch = await fetchTournamentsPage(page);
        if (batch.length === 0) return { tournaments: collected, reachedTarget: true }; // ran out of API data

        for (const t of batch) {
            if ((t.players ?? 0) < MIN_PLAYERS) continue;
            if (!t.date) continue;
            const d = new Date(t.date);
            if (d >= beforeDate) continue; // already ingested -- not this backfill's job
            if (d < untilDate) return { tournaments: collected, reachedTarget: true }; // passed the target
            collected.push(t);
        }

        if (batch.length < PAGE_SIZE) return { tournaments: collected, reachedTarget: true };
    }

    return { tournaments: collected, reachedTarget: false };
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

        // Batched (one round trip per chunk, not per row): ingestion runs from GitHub Actions
        // against a remote Neon database, where per-row inserts made a seed run take hours.
        const byPlayer = new Map<string, (typeof standings)[number]>();
        for (const s of standings) byPlayer.set(s.player, s); // last entry wins on duplicate players
        const unique = [...byPlayer.values()];

        const standingIds = new Map<string, number>();
        for (const chunk of chunked(unique, BATCH_SIZE)) {
            const { rows } = await client.query<{ id: number; player: string }>(
                `INSERT INTO standings (tournament_id, player, name, placement, wins, losses, ties)
                 SELECT $1, r.player, r.name, r.placement, r.wins, r.losses, r.ties
                 FROM jsonb_to_recordset($2::jsonb)
                     AS r(player text, name text, placement int, wins int, losses int, ties int)
                 ON CONFLICT (tournament_id, player) DO UPDATE
                     SET name = EXCLUDED.name, placement = EXCLUDED.placement, wins = EXCLUDED.wins,
                         losses = EXCLUDED.losses, ties = EXCLUDED.ties
                 RETURNING id, player`,
                [
                    tournament.id,
                    JSON.stringify(
                        chunk.map((s) => ({
                            player: s.player,
                            name: s.name,
                            placement: s.placing ?? null,
                            wins: s.record.wins,
                            losses: s.record.losses,
                            ties: s.record.ties,
                        }))
                    ),
                ]
            );
            for (const row of rows) standingIds.set(row.player, row.id);
        }

        await client.query('DELETE FROM team_pokemon WHERE standing_id = ANY($1::int[])', [[...standingIds.values()]]);

        const team = unique.flatMap((s) =>
            (s.decklist ?? []).map((p) => ({
                standing_id: standingIds.get(s.player),
                species_id: p.id,
                name: p.name,
                item: p.item ?? null,
                ability: p.ability ?? null,
                nature: p.nature ?? null,
                tera: p.tera ?? null,
                moves: p.attacks ?? [],
            }))
        );
        for (const chunk of chunked(team, BATCH_SIZE)) {
            await client.query(
                `INSERT INTO team_pokemon (standing_id, species_id, name, item, ability, nature, tera, moves)
                 SELECT r.standing_id, r.species_id, r.name, r.item, r.ability, r.nature, r.tera,
                        ARRAY(SELECT jsonb_array_elements_text(r.moves))
                 FROM jsonb_to_recordset($1::jsonb)
                     AS r(standing_id int, species_id text, name text, item text, ability text,
                          nature text, tera text, moves jsonb)`,
                [JSON.stringify(chunk)]
            );
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

        const rows = new Map<string, { phase: number; round: number; player1: string; player2: string; winner: string | null }>();
        for (const m of pairings) {
            if (!m.player1 || !m.player2) continue; // bye / no-show
            if (m.winner === -1) continue; // double loss -- not a usable result
            const winner = m.winner === 0 ? null : String(m.winner); // null = tie
            rows.set(JSON.stringify([m.phase, m.round, m.player1, m.player2]), {
                phase: m.phase,
                round: m.round,
                player1: m.player1,
                player2: m.player2,
                winner,
            });
            stored++;
        }

        for (const chunk of chunked([...rows.values()], BATCH_SIZE)) {
            await client.query(
                `INSERT INTO matches (tournament_id, phase, round, player1, player2, winner)
                 SELECT $1, r.phase, r.round, r.player1, r.player2, r.winner
                 FROM jsonb_to_recordset($2::jsonb)
                     AS r(phase int, round int, player1 text, player2 text, winner text)
                 ON CONFLICT (tournament_id, phase, round, player1, player2) DO UPDATE SET winner = EXCLUDED.winner`,
                [tournamentId, JSON.stringify(chunk)]
            );
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

async function ingestAll(toIngest: TournamentSummary[]): Promise<void> {
    let failed = 0;
    if (toIngest.length === 0) {
        console.log('No new tournaments to ingest.');
    } else {
        console.log(`Ingesting ${toIngest.length} tournament(s)...`);
        for (const tournament of toIngest) {
            try {
                await ingestTournament(tournament);
            } catch (err) {
                failed++;
                console.error(`  ${tournament.name}: failed -- ${(err as Error).message}`);
            }
        }
        console.log(`Done. Persisted ${toIngest.length - failed}/${toIngest.length} tournament(s) to Postgres.`);
    }

    // Ratings are precomputed here, never in a request (see lib/ratings-store.ts).
    // Also runs when nothing new was ingested so the tables are always populated.
    await refreshRatings();
    if (failed > 0) process.exitCode = 1;
    await pool.end();
    await prisma.$disconnect();
}

async function main() {
    const untilArg = process.argv.find((a) => a.startsWith('--until='))?.slice('--until='.length);

    if (untilArg) {
        const until = new Date(untilArg);
        if (Number.isNaN(until.getTime())) {
            console.error(`Invalid --until date: ${untilArg} (expected e.g. --until=2026-01-01)`);
            process.exitCode = 1;
            return;
        }

        const oldest = await getOldestIngestedDate();
        if (!oldest) {
            console.log('No prior data -- run without --until first to seed recent history.');
            await pool.end();
            return;
        }

        console.log(`Backfilling from ${oldest.toISOString()} back to ${until.toISOString()}...`);
        const result = await collectBackfillTournaments(oldest, until, BACKFILL_MAX_PAGES);
        if (!result.reachedTarget) {
            console.warn(
                `  WARNING: hit the ${BACKFILL_MAX_PAGES}-page budget before reaching ${until.toISOString()} -- ` +
                    `run again with --until=${untilArg} to continue further back from here.`
            );
        }

        await ingestAll(result.tournaments);
        return;
    }

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

    await ingestAll(toIngest);
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

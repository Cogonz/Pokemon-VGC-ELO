import { getPlayerElo } from '@/lib/ratings-store';
import { getPlayerTitles } from '@/lib/titles';
import { getAvailableFormats } from '@/lib/formats';
import {
    MIN_ELO_MATCHES,
    PLAYER_SORTS,
    games,
    isPlayerSort,
    normalize,
    playerElo,
    sortPlayers,
} from '@/lib/leaderboards';
import { PlayerControls } from '@/components/PlayerControls';
import {
    Avatar,
    EloBar,
    RankBadge,
    TABLE,
    TABLE_WRAP,
    TD,
    TH,
    THEAD,
    TR,
    TrophyBadge,
    WinBar,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const PODIUM_STYLES = [
    'border-amber-300/60 bg-gradient-to-b from-amber-50 to-white',
    'border-gray-300 bg-gradient-to-b from-gray-100 to-white',
    'border-orange-300/60 bg-gradient-to-b from-orange-50 to-white',
];

export default async function PlayersPage({
    searchParams,
}: {
    searchParams: Promise<{ format?: string; pq?: string; ps?: string; pa?: string; pt?: string }>;
}) {
    const { format: formatParam, pq = '', ps, pa, pt } = await searchParams;
    const adjusted = pa === '1';
    const results = pt !== '0';
    const { current } = await getAvailableFormats();
    const format = formatParam ?? current;
    const sort = isPlayerSort(ps) ? ps : 'elo';
    const query = normalize(pq);

    const [players, titles] = await Promise.all([getPlayerElo(format), getPlayerTitles(format)]);
    const ranked = sortPlayers(
        players.filter((p) => games(p) >= MIN_ELO_MATCHES),
        sort,
        adjusted,
        titles,
        results
    );
    // Rank within the full ranked list for the chosen sort, so a searched player keeps their
    // real position instead of being renumbered 1..n.
    const rankOf = new Map(ranked.map((p, i) => [p.player, i + 1]));

    // Search looks at every player, including those under the ranking threshold.
    const pool = query
        ? sortPlayers(players.filter((p) => normalize(p.name).includes(query)), sort, adjusted, titles, results)
        : ranked;
    const rows = pool.slice(0, PAGE_SIZE);
    const podium = query ? [] : ranked.slice(0, 3);

    const ratings = ranked.map((p) => playerElo(p, adjusted, results));
    const min = ratings.length ? Math.min(...ratings) : 0;
    const max = ratings.length ? Math.max(...ratings) : 0;
    const totalTitles = [...titles.values()].reduce((a, b) => a + b, 0);

    return (
        <main className="mx-auto max-w-5xl px-6 py-10">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Players</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Elo computed from match-level results across every ingested tournament in regulation{' '}
                {format ?? 'unknown'}. Ranked players need at least {MIN_ELO_MATCHES} matches; search also finds
                players below that. Tournament wins count first-place finishes at 30+ player events
                {totalTitles > 0 ? ` (${totalTitles} in this regulation)` : ''}.
            </p>

            {players.length === 0 ? (
                <p className="mt-8 text-gray-500">No data yet. Tournament data is loaded by a scheduled ingestion job.</p>
            ) : (
                <>
                    {podium.length > 0 && (
                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            {podium.map((p, i) => (
                                <div key={p.player} className={`rounded-xl border p-5 shadow-sm ${PODIUM_STYLES[i]}`}>
                                    <div className="flex items-center justify-between">
                                        <RankBadge rank={i + 1} />
                                        <TrophyBadge count={titles.get(p.player) ?? 0} />
                                    </div>
                                    <div className="mt-4 flex items-center gap-3">
                                        <Avatar name={p.name} size={44} />
                                        <div className="min-w-0">
                                            <div className="truncate text-lg font-bold text-gray-900">{p.name}</div>
                                            <div className="text-xs text-gray-500">{games(p)} matches</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-end justify-between gap-4">
                                        <div>
                                            <div className="text-3xl font-extrabold tabular-nums text-gray-900">
                                                {playerElo(p, adjusted, results)}
                                            </div>
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                {adjusted ? 'Adj. Elo' : 'Elo'}
                                            </div>
                                        </div>
                                        <WinBar wins={p.wins} losses={p.losses} ties={p.ties} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-8">
                        {/* key resets the search box when the regulation changes */}
                        <PlayerControls key={format ?? 'none'} query={pq} sort={sort} adjusted={adjusted} results={results} />
                    </div>

                    <div className={`mt-3 ${TABLE_WRAP}`}>
                        <table className={TABLE}>
                            <thead className={THEAD}>
                                <tr>
                                    <th className={`${TH} w-14`}>#</th>
                                    <th className={TH}>Player</th>
                                    <th className={TH}>{adjusted ? 'Adj. Elo' : 'Elo'}</th>
                                    <th className={TH}>Tournament wins</th>
                                    <th className={TH}>Record</th>
                                    <th className={TH}>Matches</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((p) => (
                                    <tr key={p.player} className={TR}>
                                        <td className={TD}>
                                            <RankBadge rank={rankOf.get(p.player) ?? null} />
                                        </td>
                                        <td className={TD}>
                                            <div className="flex items-center gap-3">
                                                <Avatar name={p.name} />
                                                <span className="font-semibold text-gray-900">{p.name}</span>
                                            </div>
                                        </td>
                                        <td className={TD}>
                                            <EloBar value={playerElo(p, adjusted, results)} min={min} max={max} />
                                            <div className="mt-0.5 text-[11px] text-gray-400">
                                                {adjusted ? `raw ${results ? p.rating : p.matchRating} · ` : ''}
                                                {results && p.resultBonus > 0 ? `incl. +${p.resultBonus} results` : ''}
                                            </div>
                                        </td>
                                        <td className={TD}>
                                            <TrophyBadge count={titles.get(p.player) ?? 0} />
                                        </td>
                                        <td className={TD}>
                                            <WinBar wins={p.wins} losses={p.losses} ties={p.ties} />
                                        </td>
                                        <td className={`${TD} tabular-nums text-gray-600`}>{games(p)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                            No players match &ldquo;{pq}&rdquo;.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                        {query
                            ? `${pool.length} player${pool.length === 1 ? '' : 's'} match${pool.length === 1 ? 'es' : ''}`
                            : `${ranked.length} ranked players`}
                        {pool.length > rows.length ? `, showing the first ${rows.length}` : ''}. Sorted by{' '}
                        {PLAYER_SORTS[sort]}
                        {adjusted ? ', using match-adjusted Elo' : ''}.
                    </p>
                </>
            )}
        </main>
    );
}

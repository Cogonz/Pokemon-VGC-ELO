import { getPlayerElo } from '@/lib/ratings-store';
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

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function PlayersPage({
    searchParams,
}: {
    searchParams: Promise<{ format?: string; pq?: string; ps?: string; pa?: string }>;
}) {
    const { format: formatParam, pq = '', ps, pa } = await searchParams;
    const adjusted = pa === '1';
    const { current } = await getAvailableFormats();
    const format = formatParam ?? current;
    const sort = isPlayerSort(ps) ? ps : 'elo';
    const query = normalize(pq);

    const players = await getPlayerElo(format);
    const ranked = sortPlayers(
        players.filter((p) => games(p) >= MIN_ELO_MATCHES),
        sort,
        adjusted
    );
    // Rank within the full ranked list for the chosen sort, so a searched player keeps their
    // real position instead of being renumbered 1..n.
    const rankOf = new Map(ranked.map((p, i) => [p.player, i + 1]));

    // Search looks at every player, including those under the ranking threshold.
    const pool = query ? sortPlayers(players.filter((p) => normalize(p.name).includes(query)), sort, adjusted) : ranked;
    const rows = pool.slice(0, PAGE_SIZE);

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Players</h1>
            <p className="mt-1 text-sm text-gray-500">
                Elo computed from match-level results across every ingested tournament in regulation{' '}
                {format ?? 'unknown'}. Ranked players need at least {MIN_ELO_MATCHES} matches; search also finds
                players below that.
            </p>

            {players.length === 0 ? (
                <p className="mt-8 text-gray-500">No data yet. Tournament data is loaded by a scheduled ingestion job.</p>
            ) : (
                <>
                    {/* key resets the search box when the regulation changes */}
                    <PlayerControls key={format ?? 'none'} query={pq} sort={sort} adjusted={adjusted} />
                    <table className="mt-3 w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-500">
                                <th className="py-2 pr-4">#</th>
                                <th className="py-2 pr-4">Player</th>
                                <th className="py-2 pr-4">{adjusted ? 'Adj. Elo' : 'Elo'}</th>
                                <th className="py-2 pr-4">Record</th>
                                <th className="py-2">Matches</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((p) => (
                                <tr key={p.player} className="border-b last:border-0">
                                    <td className="py-2 pr-4 text-gray-500">{rankOf.get(p.player) ?? '—'}</td>
                                    <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                    <td className="py-2 pr-4 text-gray-600">
                                        {playerElo(p, adjusted)}
                                        {adjusted && <span className="text-gray-400"> ({p.rating})</span>}
                                    </td>
                                    <td className="py-2 pr-4 text-gray-600">
                                        {p.wins}-{p.losses}-{p.ties}
                                    </td>
                                    <td className="py-2 text-gray-600">{games(p)}</td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-4 text-gray-500">
                                        No players match &ldquo;{pq}&rdquo;.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <p className="mt-2 text-xs text-gray-400">
                        {query
                            ? `${pool.length} player${pool.length === 1 ? '' : 's'} match${pool.length === 1 ? 'es' : ''}`
                            : `${ranked.length} ranked players`}
                        {pool.length > rows.length ? `, showing the first ${rows.length}` : ''}. Sorted by{' '}
                        {PLAYER_SORTS[sort]}
                        {adjusted ? ', using match-adjusted Elo (raw Elo in brackets)' : ''}.
                    </p>
                </>
            )}
        </main>
    );
}

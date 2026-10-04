import { getPokemonUsage } from '@/lib/stats';
import { getPlayerElo, getPokemonElo } from '@/lib/ratings-store';
import { getAvailableFormats } from '@/lib/formats';
import { UsageChart } from '@/components/UsageChart';
import { RegulationSelect } from '@/components/RegulationSelect';
import { PokemonTable, type PokemonRow } from '@/components/PokemonTable';
import { PlayerControls, PLAYER_SORTS, type PlayerSort } from '@/components/PlayerControls';

export const dynamic = 'force-dynamic';

const MIN_ELO_MATCHES = 3; // hide players with too few matches to trust their rating
const MIN_POKEMON_ELO_MATCHES = 15; // hide Pokemon with too few non-mirrored matches to trust their rating

export default async function Home({ searchParams }: { searchParams: Promise<{ format?: string; pq?: string; ps?: string }> }) {
    const { format: formatParam, pq = '', ps } = await searchParams;
    const playerSort: PlayerSort = ps && ps in PLAYER_SORTS ? (ps as PlayerSort) : 'elo';
    const { options, current } = await getAvailableFormats();
    const format = formatParam ?? current;

    const [usage, elo, pokemonElo] = await Promise.all([
        getPokemonUsage(format),
        getPlayerElo(format),
        getPokemonElo(format),
    ]);
    const top = usage.slice(0, 15);
    const playerQuery = pq.trim().toLowerCase();
    const games = (p: { wins: number; losses: number; ties: number }) => p.wins + p.losses + p.ties;
    const eligiblePlayers = elo.filter((p) => games(p) >= MIN_ELO_MATCHES);
    const matchedPlayers = playerQuery
        ? eligiblePlayers.filter((p) => p.name.toLowerCase().includes(playerQuery))
        : eligiblePlayers;
    const playerCompare: Record<PlayerSort, (a: (typeof elo)[number], b: (typeof elo)[number]) => number> = {
        elo: (a, b) => b.rating - a.rating,
        matches: (a, b) => games(b) - games(a),
        // shrunk toward 50% so small samples don't dominate (see PokemonTable's winRate)
        record: (a, b) => (b.wins + 5) / (games(b) + 10) - (a.wins + 5) / (games(a) + 10) || games(b) - games(a),
    };
    const leaderboard = [...matchedPlayers].sort((a, b) => playerCompare[playerSort](a, b) || a.name.localeCompare(b.name)).slice(0, 20);

    const eloById = new Map(pokemonElo.map((p) => [p.speciesId, p]));
    const usageById = new Map(usage.map((u) => [u.speciesId, u]));
    const pokemonRows: PokemonRow[] = [...new Set([...eloById.keys(), ...usageById.keys()])].map((id) => {
        const e = eloById.get(id);
        const u = usageById.get(id);
        return {
            speciesId: id,
            name: (e?.name ?? u?.name)!,
            rating: e?.rating ?? null,
            wins: e?.wins ?? 0,
            losses: e?.losses ?? 0,
            ties: e?.ties ?? 0,
            matches: e?.matches ?? 0,
            teams: u?.teams ?? 0,
            usagePct: u?.usagePct ?? 0,
            avgPercentile: u?.avgPercentile ?? null,
        };
    });
    const pokemonLeaderboard = pokemonRows.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES);

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pokemon VGC ELO</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Usage rates and average placement for regulation {format ?? 'unknown'}, computed from
                        ingested Limitless tournament data.
                    </p>
                </div>
                <RegulationSelect options={options} selected={format} />
            </div>

            {usage.length === 0 ? (
                <p className="mt-8 text-gray-500">
                    No data yet. Tournament data is loaded by a scheduled ingestion job.
                </p>
            ) : (
                <>
                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Player Elo leaderboard</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Computed from match-level results within this regulation (min {MIN_ELO_MATCHES} matches
                            shown).
                        </p>
                        <PlayerControls query={pq} sort={playerSort} />
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="py-2 pr-4">#</th>
                                    <th className="py-2 pr-4">Player</th>
                                    <th className="py-2 pr-4">Elo</th>
                                    <th className="py-2 pr-4">Record</th>
                                    <th className="py-2">Matches</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((p, i) => (
                                    <tr key={p.player} className="border-b last:border-0">
                                        <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                                        <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.rating}</td>
                                        <td className="py-2 pr-4 text-gray-600">
                                            {p.wins}-{p.losses}-{p.ties}
                                        </td>
                                        <td className="py-2 text-gray-600">{games(p)}</td>
                                    </tr>
                                ))}
                                {leaderboard.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-4 text-gray-500">
                                            No players match &ldquo;{pq}&rdquo;.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {matchedPlayers.length > leaderboard.length && (
                            <p className="mt-2 text-xs text-gray-400">
                                Showing top {leaderboard.length} of {matchedPlayers.length} players. Search to find a specific player.
                            </p>
                        )}
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Pokemon Elo leaderboard</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Team-level Elo attributed per Pokemon; a Pokemon on both rosters in a match nets exactly
                            zero rating change from it, but still counts toward its matches/record. Ratings are
                            shrunk toward 1500 in proportion to how few matches back them, so a thin sample can&apos;t
                            hold an extreme rating a larger one wouldn&apos;t support (min {MIN_POKEMON_ELO_MATCHES}{' '}
                            matches shown).
                        </p>
                        <PokemonTable
                            rows={pokemonLeaderboard}
                            sortOptions={['elo', 'usage', 'record']}
                            defaultSort="elo"
                            columns={['elo', 'record', 'usage']}
                        />
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Top usage</h2>
                        <UsageChart data={top} />
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">All Pokemon</h2>
                        <PokemonTable
                            rows={pokemonRows}
                            sortOptions={['usage', 'elo', 'record', 'finish']}
                            defaultSort="usage"
                            columns={['usage', 'finish', 'elo', 'record']}
                        />
                    </section>
                </>
            )}
        </main>
    );
}

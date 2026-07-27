import { getPokemonUsage } from '@/lib/stats';
import { computePlayerElo } from '@/lib/elo';
import { computePokemonElo } from '@/lib/pokemon-elo';
import { getAvailableFormats } from '@/lib/formats';
import { UsageChart } from '@/components/UsageChart';
import { RegulationSelect } from '@/components/RegulationSelect';

export const dynamic = 'force-dynamic';

const MIN_ELO_MATCHES = 3; // hide players with too few matches to trust their rating
const MIN_POKEMON_ELO_MATCHES = 15; // hide Pokemon with too few non-mirrored matches to trust their rating

export default async function Home({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const { options, current } = await getAvailableFormats();
    const format = formatParam ?? current;

    const [usage, elo, pokemonElo] = await Promise.all([
        getPokemonUsage(format),
        computePlayerElo(format),
        computePokemonElo(format),
    ]);
    const top = usage.slice(0, 15);
    const leaderboard = elo.filter((p) => p.wins + p.losses + p.ties >= MIN_ELO_MATCHES).slice(0, 20);
    const pokemonLeaderboard = pokemonElo.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES).slice(0, 20);

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
                    No data yet. Run <code className="rounded bg-gray-100 px-1 py-0.5">npm run ingest</code> to pull a
                    tournament first.
                </p>
            ) : (
                <>
                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Player Elo leaderboard</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Computed from match-level results within this regulation (min {MIN_ELO_MATCHES} matches
                            shown).
                        </p>
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="py-2 pr-4">#</th>
                                    <th className="py-2 pr-4">Player</th>
                                    <th className="py-2 pr-4">Elo</th>
                                    <th className="py-2">Record</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((p, i) => (
                                    <tr key={p.player} className="border-b last:border-0">
                                        <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                                        <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.rating}</td>
                                        <td className="py-2 text-gray-600">
                                            {p.wins}-{p.losses}-{p.ties}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="py-2 pr-4">#</th>
                                    <th className="py-2 pr-4">Pokemon</th>
                                    <th className="py-2 pr-4">Elo</th>
                                    <th className="py-2 pr-4">Record</th>
                                    <th className="py-2">Matches</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pokemonLeaderboard.map((p, i) => (
                                    <tr key={p.speciesId} className="border-b last:border-0">
                                        <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                                        <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.rating}</td>
                                        <td className="py-2 pr-4 text-gray-600">
                                            {p.wins}-{p.losses}-{p.ties}
                                        </td>
                                        <td className="py-2 text-gray-600">{p.matches}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Top usage</h2>
                        <UsageChart data={top} />
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">All Pokemon</h2>
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="py-2 pr-4">Pokemon</th>
                                    <th className="py-2 pr-4">Teams</th>
                                    <th className="py-2 pr-4">Usage %</th>
                                    <th className="py-2">Avg finish</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usage.map((p) => (
                                    <tr key={p.speciesId} className="border-b last:border-0">
                                        <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.teams}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.usagePct.toFixed(1)}%</td>
                                        <td className="py-2 text-gray-600">
                                            {p.avgPercentile != null ? `top ${(p.avgPercentile * 100).toFixed(0)}%` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </main>
    );
}

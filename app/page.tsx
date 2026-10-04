import Link from 'next/link';
import { getPokemonUsage } from '@/lib/stats';
import { getPlayerElo, getPokemonElo } from '@/lib/ratings-store';
import { getAvailableFormats } from '@/lib/formats';
import { MIN_ELO_MATCHES, MIN_POKEMON_ELO_MATCHES, games, sortPlayers } from '@/lib/leaderboards';

export const dynamic = 'force-dynamic';

const PREVIEW = 5;

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="mt-1 text-sm text-gray-500">{label}</div>
        </div>
    );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const { options, current } = await getAvailableFormats();
    const format = formatParam ?? current;
    const suffix = formatParam ? `?format=${encodeURIComponent(formatParam)}` : '';

    const [usage, players, pokemonElo] = await Promise.all([
        getPokemonUsage(format),
        getPlayerElo(format),
        getPokemonElo(format),
    ]);
    const tournaments = options.find((o) => o.format === format)?.tournaments ?? 0;
    const rankedPlayers = sortPlayers(
        players.filter((p) => games(p) >= MIN_ELO_MATCHES),
        'elo'
    );
    const rankedPokemon = pokemonElo.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES);
    const hasData = players.length > 0 || usage.length > 0;

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <section className="py-8">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900">Pokemon VGC ELO</h1>
                <p className="mt-3 max-w-2xl text-lg text-gray-600">
                    Player and Pokemon ratings for competitive VGC, computed from real tournament match results
                    instead of hand-tuned tier lists.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        href={`/players${suffix}`}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Player rankings
                    </Link>
                    <Link
                        href={`/pokemon${suffix}`}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Pokemon rankings
                    </Link>
                    <Link
                        href={`/teambuilder${suffix}`}
                        className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Build a team
                    </Link>
                </div>
            </section>

            {!hasData ? (
                <p className="text-gray-500">No data yet. Tournament data is loaded by a scheduled ingestion job.</p>
            ) : (
                <>
                    <section>
                        <h2 className="text-sm font-medium text-gray-500">Regulation {format ?? 'unknown'}</h2>
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Stat label="Tournaments" value={tournaments.toLocaleString()} />
                            <Stat label="Players rated" value={rankedPlayers.length.toLocaleString()} />
                            <Stat label="Pokemon rated" value={rankedPokemon.length.toLocaleString()} />
                            <Stat label="Pokemon seen" value={usage.length.toLocaleString()} />
                        </div>
                    </section>

                    <div className="mt-10 grid gap-8 md:grid-cols-2">
                        <section>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-lg font-semibold text-gray-800">Top players</h2>
                                <Link href={`/players${suffix}`} className="text-sm text-indigo-600 hover:underline">
                                    View all
                                </Link>
                            </div>
                            <table className="mt-3 w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="py-2 pr-3">#</th>
                                        <th className="py-2 pr-3">Player</th>
                                        <th className="py-2 pr-3">Elo</th>
                                        <th className="py-2">Record</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rankedPlayers.slice(0, PREVIEW).map((p, i) => (
                                        <tr key={p.player} className="border-b last:border-0">
                                            <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                                            <td className="py-2 pr-3 font-medium text-gray-900">{p.name}</td>
                                            <td className="py-2 pr-3 text-gray-600">{p.rating}</td>
                                            <td className="py-2 text-gray-600">
                                                {p.wins}-{p.losses}-{p.ties}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        <section>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-lg font-semibold text-gray-800">Top Pokemon</h2>
                                <Link href={`/pokemon${suffix}`} className="text-sm text-indigo-600 hover:underline">
                                    View all
                                </Link>
                            </div>
                            <table className="mt-3 w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="py-2 pr-3">#</th>
                                        <th className="py-2 pr-3">Pokemon</th>
                                        <th className="py-2 pr-3">Elo</th>
                                        <th className="py-2">Record</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rankedPokemon.slice(0, PREVIEW).map((p, i) => (
                                        <tr key={p.speciesId} className="border-b last:border-0">
                                            <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                                            <td className="py-2 pr-3 font-medium text-gray-900">{p.name}</td>
                                            <td className="py-2 pr-3 text-gray-600">{p.rating}</td>
                                            <td className="py-2 text-gray-600">
                                                {p.wins}-{p.losses}-{p.ties}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    </div>

                    <section className="mt-10">
                        <h2 className="text-lg font-semibold text-gray-800">Most used</h2>
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {usage.slice(0, 10).map((u) => (
                                <li key={u.speciesId} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                                    {u.name} <span className="text-gray-400">{u.usagePct.toFixed(1)}%</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="mt-10 rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
                        <h2 className="text-base font-semibold text-gray-800">How the ratings work</h2>
                        <p className="mt-2">
                            <strong>Player Elo</strong> replays every match chronologically, so ratings carry across
                            tournaments. <strong>Pokemon Elo</strong> credits each Pokemon for team results with a
                            regularized regression over the whole match history, shrinking thin samples toward 1500.
                            Data comes from{' '}
                            <a className="text-indigo-600 hover:underline" href="https://limitlesstcg.com">
                                Limitless TCG
                            </a>{' '}
                            and refreshes on a schedule.
                        </p>
                    </section>
                </>
            )}
        </main>
    );
}

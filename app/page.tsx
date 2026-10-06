import Link from 'next/link';
import { getPokemonUsage } from '@/lib/stats';
import { getPlayerElo, getPokemonElo } from '@/lib/ratings-store';
import { getAvailableFormats } from '@/lib/formats';
import { MIN_ELO_MATCHES, MIN_POKEMON_ELO_MATCHES, games, sortPlayers } from '@/lib/leaderboards';
import { getPlayerTitles } from '@/lib/titles';
import { getSpeciesTypeMap } from '@/lib/species-types';
import { Sprite } from '@/components/Sprite';
import { Avatar, RankBadge, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, TrophyBadge, TypeBadge, WinBar } from '@/components/ui';

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

    const [usage, players, pokemonElo, titles, types] = await Promise.all([
        getPokemonUsage(format),
        getPlayerElo(format),
        getPokemonElo(format),
        getPlayerTitles(format),
        getSpeciesTypeMap(),
    ]);
    const tournaments = options.find((o) => o.format === format)?.tournaments ?? 0;
    const rankedPlayers = sortPlayers(
        players.filter((p) => games(p) >= MIN_ELO_MATCHES),
        'elo'
    );
    const rankedPokemon = pokemonElo.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES);
    const hasData = players.length > 0 || usage.length > 0;

    return (
        <main className="mx-auto max-w-5xl px-6 py-10">
            <section className="py-8">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900">Pokemon VGC ELO</h1>
                <p className="mt-3 max-w-2xl text-lg text-gray-600">
                    Player and Pokemon ratings for competitive VGC, computed from real tournament match results
                    instead of hand-tuned tier lists.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        href={`/players${suffix}`}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                    >
                        Player rankings
                    </Link>
                    <Link
                        href={`/pokemon${suffix}`}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
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
                            <div className={`mt-3 ${TABLE_WRAP}`}>
                                <table className={TABLE}>
                                    <thead className={THEAD}>
                                        <tr>
                                            <th className={`${TH} w-12`}>#</th>
                                            <th className={TH}>Player</th>
                                            <th className={TH}>Elo</th>
                                            <th className={TH}>Wins</th>
                                            <th className={TH}>Record</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankedPlayers.slice(0, PREVIEW).map((p, i) => (
                                            <tr key={p.player} className={TR}>
                                                <td className={TD}>
                                                    <RankBadge rank={i + 1} />
                                                </td>
                                                <td className={TD}>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar name={p.name} size={28} />
                                                        <span className="font-semibold text-gray-900">{p.name}</span>
                                                    </div>
                                                </td>
                                                <td className={`${TD} font-semibold tabular-nums text-gray-900`}>{p.rating}</td>
                                                <td className={TD}>
                                                    <TrophyBadge count={titles.get(p.player) ?? 0} />
                                                </td>
                                                <td className={TD}>
                                                    <WinBar wins={p.wins} losses={p.losses} ties={p.ties} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section>
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-lg font-semibold text-gray-800">Top Pokemon</h2>
                                <Link href={`/pokemon${suffix}`} className="text-sm text-indigo-600 hover:underline">
                                    View all
                                </Link>
                            </div>
                            <div className={`mt-3 ${TABLE_WRAP}`}>
                                <table className={TABLE}>
                                    <thead className={THEAD}>
                                        <tr>
                                            <th className={`${TH} w-12`}>#</th>
                                            <th className={TH}>Pokemon</th>
                                            <th className={TH}>Elo</th>
                                            <th className={TH}>Record</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankedPokemon.slice(0, PREVIEW).map((p, i) => (
                                            <tr key={p.speciesId} className={TR}>
                                                <td className={TD}>
                                                    <RankBadge rank={i + 1} />
                                                </td>
                                                <td className={TD}>
                                                    <div className="flex items-center gap-2">
                                                        <Sprite speciesId={p.speciesId} size={36} />
                                                        <div>
                                                            <Link
                                                                href={`/pokemon/${encodeURIComponent(p.speciesId)}${suffix}`}
                                                                className="font-semibold text-gray-900 hover:text-indigo-600 hover:underline"
                                                            >
                                                                {p.name}
                                                            </Link>
                                                            <div className="flex gap-1">
                                                                <TypeBadge type={types[p.speciesId]?.type1} />
                                                                <TypeBadge type={types[p.speciesId]?.type2} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`${TD} font-semibold tabular-nums text-gray-900`}>{p.rating}</td>
                                                <td className={TD}>
                                                    <WinBar wins={p.wins} losses={p.losses} ties={p.ties} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
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
                            regularized regression over the whole match history, shrinking thin samples toward 1500. Both
                            then add a capped, positive-only bonus for tournament results: top finishes at large
                            events (weighted by field size), and for Pokemon, how much better their teams finish than
                            the average team. Every table can show match Elo alone.
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

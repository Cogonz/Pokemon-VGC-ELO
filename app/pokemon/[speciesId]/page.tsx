import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPokemonElo } from '@/lib/ratings-store';
import { getPokemonUsage } from '@/lib/stats';
import { getAvailableFormats } from '@/lib/formats';
import { getSpeciesTypeMap } from '@/lib/species-types';
import { getPokemonDetail, getPokemonHistory } from '@/lib/pokemon-detail';
import { MIN_POKEMON_ELO_MATCHES } from '@/lib/leaderboards';
import { Sprite } from '@/components/Sprite';
import { BarList, RankBadge, TABLE, TABLE_WRAP, TD, TH, THEAD, TR, TrophyBadge, TypeBadge, WinBar } from '@/components/ui';

export const dynamic = 'force-dynamic';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
            {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
        </div>
    );
}

export default async function PokemonDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ speciesId: string }>;
    searchParams: Promise<{ format?: string }>;
}) {
    const { speciesId: rawId } = await params;
    const speciesId = decodeURIComponent(rawId);
    const { format: formatParam } = await searchParams;
    const { current } = await getAvailableFormats();
    const format = formatParam ?? current;
    if (!format) notFound();

    const [detail, elo, usage, types, history] = await Promise.all([
        getPokemonDetail(speciesId, format),
        getPokemonElo(format),
        getPokemonUsage(format),
        getSpeciesTypeMap(),
        getPokemonHistory(format),
    ]);
    if (!detail) notFound();

    const rating = elo.find((p) => p.speciesId === speciesId);
    const ranked = elo.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES);
    const rank = ranked.findIndex((p) => p.speciesId === speciesId) + 1;
    const u = usage.find((x) => x.speciesId === speciesId);
    const name = rating?.name ?? u?.name ?? speciesId;
    const t = types[speciesId];
    const h = history.get(speciesId);
    const suffix = formatParam ? `?format=${encodeURIComponent(formatParam)}` : '';
    const hasTera = detail.teras.length > 0;

    return (
        <main className="mx-auto max-w-5xl px-6 py-10">
            <Link href={`/pokemon${suffix}`} className="text-sm text-indigo-600 hover:underline">
                ← All Pokemon
            </Link>

            <div className="mt-4 flex flex-wrap items-center gap-5">
                <Sprite speciesId={speciesId} size={96} />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{name}</h1>
                    <div className="mt-1 flex items-center gap-2">
                        <TypeBadge type={t?.type1} />
                        <TypeBadge type={t?.type2} />
                        <span className="text-sm text-gray-500">Regulation {format}</span>
                    </div>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                    label="Elo"
                    value={rating ? rating.rating : '—'}
                    sub={
                        rating
                            ? `${rating.matchRating} match${rating.resultBonus > 0 ? ` + ${rating.resultBonus} results` : ''}`
                            : undefined
                    }
                />
                <Stat
                    label="Rank"
                    value={rank > 0 ? `#${rank}` : '—'}
                    sub={rank > 0 ? `of ${ranked.length}` : `needs ${MIN_POKEMON_ELO_MATCHES}+ matches`}
                />
                <Stat
                    label="Usage"
                    value={u ? `${u.usagePct.toFixed(1)}%` : '—'}
                    sub={`${detail.teams.toLocaleString()} teams`}
                />
                <Stat
                    label="Avg finish"
                    value={u?.avgPercentile != null ? `top ${(u.avgPercentile * 100).toFixed(0)}%` : '—'}
                />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Tournament history</div>
                        <div className="mt-2 flex items-center gap-3">
                            <TrophyBadge count={h?.titles ?? 0} />
                            <span className="text-sm text-gray-600">
                                {h?.topCuts ?? 0} top-8 finish{(h?.topCuts ?? 0) === 1 ? '' : 'es'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Match record</div>
                    <div className="mt-2">
                        {rating ? <WinBar wins={rating.wins} losses={rating.losses} ties={rating.ties} /> : '—'}
                    </div>
                </div>
            </div>

            <p className="mt-8 text-xs text-gray-400">
                Percentages are the share of the {detail.teams.toLocaleString()} teams running {name} that use each
                option, so move lists add up to roughly 400%, not 100%. Impact badges are relative: each shows how teams using that option did compared with teams using this Pokemon's other options, from one model that fits items, abilities, natures and moves together and adjusts for player skill. They say how a choice compares with the alternatives, not how good it is on its own, so a badge near zero on a popular option means it performs like the rest, not that it is bad.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
                <BarList
                    title="Moves"
                    entries={detail.moves}
                    hint="Badge = Elo difference vs this Pokemon's other moves. Not shown for near-universal moves. Grey = too few teams."
                />
                <BarList
                    title="Items"
                    entries={detail.items}
                    hint="Badge = Elo difference vs this Pokemon's other items. Grey = too few teams to compare."
                />
                <BarList title="Abilities" entries={detail.abilities} hint="Badge = Elo difference vs this Pokemon's other abilities." />
                <BarList title="Natures" entries={detail.natures} hint="Badge = Elo difference vs this Pokemon's other natures." />
                {hasTera && <BarList title="Tera types" entries={detail.teras} />}
                <BarList title="Common teammates" entries={detail.teammates} hint="Share of teams that also run them" />
            </div>

            <section className="mt-8">
                <h2 className="text-lg font-semibold text-gray-900">Best tournament finishes</h2>
                <p className="mt-1 text-sm text-gray-500">Top-4 teams carrying {name}, largest events first.</p>
                {detail.results.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">No top-4 finishes in this regulation yet.</p>
                ) : (
                    <div className={`mt-3 ${TABLE_WRAP}`}>
                        <table className={TABLE}>
                            <thead className={THEAD}>
                                <tr>
                                    <th className={`${TH} w-14`}>Place</th>
                                    <th className={TH}>Tournament</th>
                                    <th className={TH}>Player</th>
                                    <th className={TH}>Date</th>
                                    <th className={TH}>Players</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.results.map((r, i) => (
                                    <tr key={i} className={TR}>
                                        <td className={TD}>
                                            <RankBadge rank={r.placement} />
                                        </td>
                                        <td className={`${TD} font-medium text-gray-900`}>{r.tournament}</td>
                                        <td className={`${TD} text-gray-700`}>{r.player}</td>
                                        <td className={`${TD} tabular-nums text-gray-500`}>{r.date ?? '—'}</td>
                                        <td className={`${TD} tabular-nums text-gray-500`}>{r.players ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}

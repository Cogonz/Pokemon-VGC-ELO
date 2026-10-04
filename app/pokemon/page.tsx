import { getPokemonUsage } from '@/lib/stats';
import { getPokemonElo } from '@/lib/ratings-store';
import { getAvailableFormats } from '@/lib/formats';
import { MIN_POKEMON_ELO_MATCHES, buildPokemonRows } from '@/lib/leaderboards';
import { UsageChart } from '@/components/UsageChart';
import { PokemonTable } from '@/components/PokemonTable';

export const dynamic = 'force-dynamic';

export default async function PokemonPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const { current } = await getAvailableFormats();
    const format = formatParam ?? current;

    const [usage, pokemonElo] = await Promise.all([getPokemonUsage(format), getPokemonElo(format)]);
    const rows = buildPokemonRows(pokemonElo, usage);
    const leaderboard = rows.filter((p) => p.matches >= MIN_POKEMON_ELO_MATCHES);

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Pokemon</h1>
            <p className="mt-1 text-sm text-gray-500">
                Usage and Elo per Pokemon for regulation {format ?? 'unknown'}, computed from ingested Limitless
                tournament data.
            </p>

            {rows.length === 0 ? (
                <p className="mt-8 text-gray-500">No data yet. Tournament data is loaded by a scheduled ingestion job.</p>
            ) : (
                <>
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
                            key={`lb-${format}`}
                            rows={leaderboard}
                            sortOptions={['elo', 'usage', 'record']}
                            defaultSort="elo"
                            columns={['elo', 'record', 'usage']}
                        />
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">Top usage</h2>
                        <UsageChart data={usage.slice(0, 15)} />
                    </section>

                    <section className="mt-8">
                        <h2 className="text-lg font-semibold text-gray-800">All Pokemon</h2>
                        <PokemonTable
                            key={`all-${format}`}
                            rows={rows}
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

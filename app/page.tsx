import { getPokemonUsage } from '@/lib/stats';
import { UsageChart } from '@/components/UsageChart';

export const dynamic = 'force-dynamic';

export default async function Home() {
    const usage = await getPokemonUsage();
    const top = usage.slice(0, 15);

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Pokemon VGC ELO</h1>
            <p className="mt-1 text-sm text-gray-500">
                Usage rates and average placement, computed from ingested Limitless tournament data.
            </p>

            {usage.length === 0 ? (
                <p className="mt-8 text-gray-500">
                    No data yet. Run <code className="rounded bg-gray-100 px-1 py-0.5">npm run ingest</code> to pull a
                    tournament first.
                </p>
            ) : (
                <>
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
                                    <th className="py-2">Avg placement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usage.map((p) => (
                                    <tr key={p.speciesId} className="border-b last:border-0">
                                        <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.teams}</td>
                                        <td className="py-2 pr-4 text-gray-600">{p.usagePct.toFixed(1)}%</td>
                                        <td className="py-2 text-gray-600">
                                            {p.avgPlacement != null ? p.avgPlacement.toFixed(1) : '—'}
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

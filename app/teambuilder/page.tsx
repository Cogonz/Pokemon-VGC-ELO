import { auth } from '@/auth';
import { computePokemonElo } from '@/lib/pokemon-elo';
import { getAvailableFormats } from '@/lib/formats';
import { listSavedTeams } from '@/lib/teams';
import { RegulationSelect } from '@/components/RegulationSelect';
import { TeamBuilder } from '@/components/TeamBuilder';

export const dynamic = 'force-dynamic';

const MIN_PICKER_MATCHES = 15; // same trust threshold as the Pokemon Elo leaderboard

export default async function TeamBuilderPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const { options, current } = await getAvailableFormats();
    const format = formatParam ?? current;

    const [session, pokemonElo] = await Promise.all([auth(), computePokemonElo(format)]);
    const savedTeams = session?.user?.id ? await listSavedTeams(session.user.id) : [];

    const pokemonOptions = pokemonElo
        .filter((p) => p.matches >= MIN_PICKER_MATCHES)
        .sort((a, b) => b.rating - a.rating)
        .map((p) => ({ speciesId: p.speciesId, name: p.name, rating: p.rating, matches: p.matches }));

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Team Builder</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Pick Pokemon sorted by Elo for regulation {format ?? 'unknown'}.
                    </p>
                </div>
                <RegulationSelect options={options} selected={format} />
            </div>

            <TeamBuilder pokemonOptions={pokemonOptions} signedIn={!!session?.user} initialTeams={savedTeams} />
        </main>
    );
}

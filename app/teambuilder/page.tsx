import { getPokemonElo } from '@/lib/ratings-store';
import { getUserId, isAuthConfigured } from '@/lib/session';
import { listSavedTeams, type SavedTeam } from '@/lib/teams';
import { getAvailableFormats } from '@/lib/formats';
import { getSpeciesTypeMap } from '@/lib/species-types';
import { RegulationSelect } from '@/components/RegulationSelect';
import { TeamBuilder } from '@/components/TeamBuilder';

export const dynamic = 'force-dynamic';

const MIN_PICKER_MATCHES = 15; // same trust threshold as the Pokemon Elo leaderboard

export default async function TeamBuilderPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const { options, current } = await getAvailableFormats();
    const format = formatParam ?? current;

    const [pokemonElo, speciesTypes, userId] = await Promise.all([
        getPokemonElo(format),
        getSpeciesTypeMap(),
        getUserId(),
    ]);
    // Saved teams are only loaded for a signed-in user; a failure here must not break the picker.
    let savedTeams: SavedTeam[] = [];
    if (userId) {
        try {
            savedTeams = await listSavedTeams(userId);
        } catch {
            savedTeams = [];
        }
    }

    const pokemonOptions = pokemonElo
        .filter((p) => p.matches >= MIN_PICKER_MATCHES)
        .sort((a, b) => b.rating - a.rating)
        .map((p) => ({
            speciesId: p.speciesId,
            name: p.name,
            rating: p.rating,
            matches: p.matches,
            type1: speciesTypes[p.speciesId]?.type1 ?? null,
            type2: speciesTypes[p.speciesId]?.type2 ?? null,
        }));

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

            <TeamBuilder
                pokemonOptions={pokemonOptions}
                signedIn={!!userId}
                loginAvailable={isAuthConfigured()}
                initialTeams={savedTeams}
            />
        </main>
    );
}

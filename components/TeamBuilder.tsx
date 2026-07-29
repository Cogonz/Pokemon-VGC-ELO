'use client';

import { useState } from 'react';
import type { SavedTeam } from '@/lib/teams';
import { analyzeTeamWeaknesses, effectiveness } from '@/lib/type-analysis';

interface PokemonOption {
    speciesId: string;
    name: string;
    rating: number;
    matches: number;
    type1: string | null;
    type2: string | null;
}

interface SlotPokemon {
    speciesId: string;
    name: string;
    type1: string | null;
    type2: string | null;
    item: string;
    ability: string;
    nature: string;
    tera: string;
    moves: [string, string, string, string];
}

const MAX_WEAKNESSES_SHOWN = 2;
const COUNTERS_PER_WEAKNESS = 4;

const TEAM_SIZE = 6;
const emptySlots = (): (SlotPokemon | null)[] => Array(TEAM_SIZE).fill(null);

export function TeamBuilder({
    pokemonOptions,
    signedIn,
    initialTeams,
}: {
    pokemonOptions: PokemonOption[];
    signedIn: boolean;
    initialTeams: SavedTeam[];
}) {
    const [slots, setSlots] = useState<(SlotPokemon | null)[]>(emptySlots());
    const [teamName, setTeamName] = useState('');
    const [search, setSearch] = useState('');
    const [savedTeams, setSavedTeams] = useState(initialTeams);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filledCount = slots.filter(Boolean).length;
    const pickedIds = new Set(slots.filter((s): s is SlotPokemon => s !== null).map((s) => s.speciesId));
    // pokemonOptions arrives sorted by Elo descending (see app/teambuilder/page.tsx),
    // so the first N left after excluding what's already picked are the strongest,
    // best-tested Pokemon not yet on the team -- a real recommendation, not just a
    // re-display of the full list.
    const unpicked = pokemonOptions.filter((p) => !pickedIds.has(p.speciesId));
    const suggestions = unpicked.slice(0, 5);
    const filteredOptions = unpicked.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

    const currentTeam = slots.filter((s): s is SlotPokemon => s !== null);
    // Type effectiveness is exact game mechanics, not a statistical estimate --
    // unlike Elo, there's no small-sample concern here regardless of team size.
    const weaknesses = analyzeTeamWeaknesses(
        currentTeam.filter((s) => s.type1).map((s) => ({ type1: s.type1 as string, type2: s.type2 }))
    ).slice(0, MAX_WEAKNESSES_SHOWN);

    function addPokemon(option: PokemonOption) {
        const emptyIndex = slots.findIndex((s) => s === null);
        if (emptyIndex === -1) return;
        const next = [...slots];
        next[emptyIndex] = {
            speciesId: option.speciesId,
            name: option.name,
            type1: option.type1,
            type2: option.type2,
            item: '',
            ability: '',
            nature: '',
            tera: '',
            moves: ['', '', '', ''],
        };
        setSlots(next);
    }

    function removeSlot(index: number) {
        const next = [...slots];
        next[index] = null;
        setSlots(next);
    }

    function updateSlot(index: number, field: keyof Omit<SlotPokemon, 'speciesId' | 'name' | 'moves'>, value: string) {
        const slot = slots[index];
        if (!slot) return;
        const next = [...slots];
        next[index] = { ...slot, [field]: value };
        setSlots(next);
    }

    function updateMove(index: number, moveIndex: number, value: string) {
        const slot = slots[index];
        if (!slot) return;
        const moves = [...slot.moves] as SlotPokemon['moves'];
        moves[moveIndex] = value;
        const next = [...slots];
        next[index] = { ...slot, moves };
        setSlots(next);
    }

    async function handleSave() {
        setError(null);
        const chosen = slots.filter((s): s is SlotPokemon => s !== null);
        if (!teamName.trim()) {
            setError('Give the team a name.');
            return;
        }
        if (chosen.length === 0) {
            setError('Add at least one Pokemon.');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: teamName.trim(),
                    pokemon: chosen.map((s) => ({
                        speciesID: s.speciesId,
                        item: s.item || null,
                        ability: s.ability || null,
                        nature: s.nature || null,
                        tera: s.tera || null,
                        moves: s.moves.filter((m) => m.trim() !== ''),
                    })),
                }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ? JSON.stringify(body.error) : `Save failed (${res.status})`);
            }

            const saved: SavedTeam = await res.json();
            setSavedTeams([saved, ...savedTeams]);
            setSlots(emptySlots());
            setTeamName('');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: number) {
        const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
        if (res.ok) setSavedTeams(savedTeams.filter((t) => t.id !== id));
    }

    return (
        <div className="mt-8 grid gap-8 md:grid-cols-2">
            <section>
                <h2 className="text-lg font-semibold text-gray-800">Pick Pokemon ({filledCount}/6)</h2>

                {suggestions.length > 0 && filledCount < TEAM_SIZE && (
                    <div className="mt-2 rounded border border-indigo-100 bg-indigo-50 p-3">
                        <p className="text-xs font-medium text-indigo-700">Recommended (strong, not on your team)</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {suggestions.map((p) => (
                                <button
                                    key={p.speciesId}
                                    type="button"
                                    onClick={() => addPokemon(p)}
                                    className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                                >
                                    {p.name} &middot; {p.rating}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mt-2 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
                <ul className="mt-3 max-h-96 overflow-y-auto rounded border border-gray-200">
                    {filteredOptions.map((p) => (
                        <li key={p.speciesId} className="border-b last:border-0">
                            <button
                                type="button"
                                onClick={() => addPokemon(p)}
                                disabled={filledCount >= TEAM_SIZE}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <span className="font-medium text-gray-900">{p.name}</span>
                                <span className="text-gray-500">
                                    {p.rating} Elo &middot; {p.matches} matches
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h2 className="text-lg font-semibold text-gray-800">Your team</h2>

                {weaknesses.length > 0 && (
                    <div className="mt-2 space-y-2">
                        {weaknesses.map((w) => {
                            const counters = unpicked
                                .filter((p) => p.type1 && effectiveness([p.type1, p.type2], w.type) < 1)
                                .slice(0, COUNTERS_PER_WEAKNESS);
                            const severe = !w.hasAnswer;
                            return (
                                <div
                                    key={w.type}
                                    className={`rounded border p-3 ${severe ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}`}
                                >
                                    <p className={`text-xs font-medium ${severe ? 'text-red-700' : 'text-amber-700'}`}>
                                        {w.weakCount}/{w.teamSize} weak to {w.type}
                                        {severe && ' -- no answer on your team'}
                                    </p>
                                    {counters.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {counters.map((p) => (
                                                <button
                                                    key={p.speciesId}
                                                    type="button"
                                                    onClick={() => addPokemon(p)}
                                                    className={`rounded-full border bg-white px-3 py-1 text-xs font-medium ${severe ? 'border-red-200 text-red-700 hover:bg-red-100' : 'border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                                                >
                                                    {p.name} &middot; {p.rating}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="mt-3 space-y-3">
                    {slots.map((slot, i) =>
                        slot ? (
                            <div key={i} className="rounded border border-gray-200 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-900">{slot.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeSlot(i)}
                                        className="text-xs text-gray-400 hover:text-gray-600"
                                    >
                                        remove
                                    </button>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <input
                                        placeholder="Item"
                                        value={slot.item}
                                        onChange={(e) => updateSlot(i, 'item', e.target.value)}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                    <input
                                        placeholder="Ability"
                                        value={slot.ability}
                                        onChange={(e) => updateSlot(i, 'ability', e.target.value)}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                    <input
                                        placeholder="Nature"
                                        value={slot.nature}
                                        onChange={(e) => updateSlot(i, 'nature', e.target.value)}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                    <input
                                        placeholder="Tera type"
                                        value={slot.tera}
                                        onChange={(e) => updateSlot(i, 'tera', e.target.value)}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {slot.moves.map((move, mi) => (
                                        <input
                                            key={mi}
                                            placeholder={`Move ${mi + 1}`}
                                            value={move}
                                            onChange={(e) => updateMove(i, mi, e.target.value)}
                                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div
                                key={i}
                                className="rounded border border-dashed border-gray-200 p-3 text-sm text-gray-400"
                            >
                                Empty slot
                            </div>
                        )
                    )}
                </div>

                <div className="mt-4">
                    <input
                        type="text"
                        placeholder="Team name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                    />
                    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                    {signedIn ? (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="mt-2 rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save team'}
                        </button>
                    ) : (
                        <p className="mt-2 text-sm text-gray-500">Sign in with GitHub to save teams.</p>
                    )}
                </div>

                {savedTeams.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-sm font-semibold text-gray-700">Your saved teams</h3>
                        <ul className="mt-2 space-y-2">
                            {savedTeams.map((t) => (
                                <li
                                    key={t.id}
                                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm"
                                >
                                    <div>
                                        <span className="font-medium text-gray-900">{t.name}</span>
                                        <span className="ml-2 text-gray-500">
                                            {t.pokemon.map((p) => p.speciesID).join(', ')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(t.id)}
                                        className="text-xs text-gray-400 hover:text-red-600"
                                    >
                                        delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
}

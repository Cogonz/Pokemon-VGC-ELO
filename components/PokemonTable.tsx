'use client';

import { useMemo, useState } from 'react';
import { AdjustedToggle } from '@/components/AdjustedToggle';
import { usageAdjustedScore } from '@/lib/recommend';

export interface PokemonRow {
    speciesId: string;
    name: string;
    rating: number | null; // null = no stored Elo for this Pokemon
    wins: number;
    losses: number;
    ties: number;
    matches: number;
    teams: number;
    usagePct: number;
    avgPercentile: number | null;
}

type SortKey = 'elo' | 'usage' | 'record' | 'finish';

const SORT_LABELS: Record<SortKey, string> = {
    elo: 'Elo',
    usage: 'Total usage',
    record: 'W-L record',
    finish: 'Avg finish',
};

// Win rate shrunk toward 50% (as if every Pokemon had 20 extra even games), so a 13-3 sample
// doesn't outrank a 1000-game record.
const winRate = (r: PokemonRow) => (r.wins + 10) / (r.matches + 20);

// Descending for everything except average finish (lower percentile = better).
// Rows missing the sort value always go last.
// The displayed/sorted Elo: raw, or shrunk toward 1500 by how rarely the Pokemon is played.
const eloOf = (r: PokemonRow, adjusted: boolean): number | null =>
    r.rating == null ? null : adjusted ? Math.round(usageAdjustedScore(r.rating, r.usagePct)) : r.rating;

const COMPARE: Record<SortKey, (a: PokemonRow, b: PokemonRow, adjusted: boolean) => number> = {
    elo: (a, b, adjusted) => (eloOf(b, adjusted) ?? -Infinity) - (eloOf(a, adjusted) ?? -Infinity),
    usage: (a, b) => b.teams - a.teams,
    record: (a, b) => winRate(b) - winRate(a) || b.matches - a.matches,
    finish: (a, b) => (a.avgPercentile ?? Infinity) - (b.avgPercentile ?? Infinity),
};

const PAGE = 25;

export function PokemonTable({
    rows,
    sortOptions,
    defaultSort,
    columns,
}: {
    rows: PokemonRow[];
    sortOptions: SortKey[];
    defaultSort: SortKey;
    columns: SortKey[];
}) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>(defaultSort);
    const [visible, setVisible] = useState(PAGE);
    const [adjusted, setAdjusted] = useState(false);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
        return [...filtered].sort((a, b) => COMPARE[sort](a, b, adjusted) || a.name.localeCompare(b.name));
    }, [rows, query, sort, adjusted]);

    const cell = (r: PokemonRow, key: SortKey) => {
        switch (key) {
            case 'elo': {
                const v = eloOf(r, adjusted);
                if (v == null) return '—';
                return adjusted ? `${v} (${r.rating})` : v;
            }
            case 'usage':
                return `${r.usagePct.toFixed(1)}% (${r.teams})`;
            case 'record':
                return r.matches > 0 ? `${r.wins}-${r.losses}-${r.ties}` : '—';
            case 'finish':
                return r.avgPercentile != null ? `top ${(r.avgPercentile * 100).toFixed(0)}%` : '—';
        }
    };

    return (
        <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setVisible(PAGE);
                    }}
                    placeholder="Search Pokemon"
                    aria-label="Search Pokemon"
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                />
                <label className="flex items-center gap-2 text-sm text-gray-500">
                    Sort by
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                    >
                        {sortOptions.map((k) => (
                            <option key={k} value={k}>
                                {SORT_LABELS[k]}
                            </option>
                        ))}
                    </select>
                </label>
                <AdjustedToggle
                    checked={adjusted}
                    onChange={setAdjusted}
                    help="Shrinks each Pokemon's Elo toward 1500 based on how rarely it's played, since low-usage Pokemon get inflated ratings from a small, self-selected sample. Recommendations use this."
                />
                <span className="text-xs text-gray-400">{shown.length} Pokemon</span>
            </div>

            <table className="mt-3 w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-4">#</th>
                        <th className="py-2 pr-4">Pokemon</th>
                        {columns.map((k) => (
                            <th key={k} className="py-2 pr-4">
                                {k === 'usage' ? 'Usage (teams)' : k === 'elo' && adjusted ? 'Adj. Elo (raw)' : SORT_LABELS[k]}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {shown.slice(0, visible).map((r, i) => (
                        <tr key={r.speciesId} className="border-b last:border-0">
                            <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                            <td className="py-2 pr-4 font-medium text-gray-900">{r.name}</td>
                            {columns.map((k) => (
                                <td key={k} className="py-2 pr-4 text-gray-600">
                                    {cell(r, k)}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {shown.length === 0 && (
                        <tr>
                            <td colSpan={columns.length + 2} className="py-4 text-gray-500">
                                No Pokemon match &ldquo;{query}&rdquo;.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {shown.length > visible && (
                <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE * 4)}
                    className="mt-3 text-sm text-indigo-600 hover:underline"
                >
                    Show more ({shown.length - visible} remaining)
                </button>
            )}
        </div>
    );
}

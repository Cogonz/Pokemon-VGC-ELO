'use client';

import { useMemo, useState } from 'react';
import { AdjustedToggle } from '@/components/AdjustedToggle';
import { Sprite } from '@/components/Sprite';
import {
    EloBar,
    RankBadge,
    SearchInput,
    SegmentedControl,
    TABLE,
    TABLE_WRAP,
    TD,
    TH,
    THEAD,
    TR,
    TypeBadge,
    UsageBar,
    WinBar,
} from '@/components/ui';
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
    type1: string | null;
    type2: string | null;
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

// The displayed/sorted Elo: raw, or shrunk toward 1500 by how rarely the Pokemon is played.
const eloOf = (r: PokemonRow, adjusted: boolean): number | null =>
    r.rating == null ? null : adjusted ? Math.round(usageAdjustedScore(r.rating, r.usagePct)) : r.rating;

// Descending for everything except average finish (lower percentile = better).
// Rows missing the sort value always go last.
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

    const { min, max } = useMemo(() => {
        const vals = rows.map((r) => eloOf(r, adjusted)).filter((v): v is number => v != null);
        return { min: Math.min(...vals), max: Math.max(...vals) };
    }, [rows, adjusted]);

    const header = (k: SortKey) =>
        k === 'usage' ? 'Usage (teams)' : k === 'elo' && adjusted ? 'Adj. Elo' : SORT_LABELS[k];

    const cell = (r: PokemonRow, key: SortKey) => {
        switch (key) {
            case 'elo': {
                const v = eloOf(r, adjusted);
                if (v == null) return <span className="text-gray-400">—</span>;
                return (
                    <div>
                        <EloBar value={v} min={min} max={max} />
                        {adjusted && <div className="mt-0.5 text-[11px] text-gray-400">raw {r.rating}</div>}
                    </div>
                );
            }
            case 'usage':
                return <UsageBar pct={r.usagePct} teams={r.teams} />;
            case 'record':
                return <WinBar wins={r.wins} losses={r.losses} ties={r.ties} />;
            case 'finish':
                return r.avgPercentile != null ? (
                    <span className="tabular-nums text-gray-700">top {(r.avgPercentile * 100).toFixed(0)}%</span>
                ) : (
                    <span className="text-gray-400">—</span>
                );
        }
    };

    return (
        <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
                <SearchInput
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setVisible(PAGE);
                    }}
                    placeholder="Search Pokemon"
                    aria-label="Search Pokemon"
                />
                <SegmentedControl
                    label="Sort by"
                    value={sort}
                    onChange={setSort}
                    options={sortOptions.map((k) => ({ value: k, label: SORT_LABELS[k] }))}
                />
                <AdjustedToggle
                    checked={adjusted}
                    onChange={setAdjusted}
                    help="Shrinks each Pokemon's Elo toward 1500 based on how rarely it's played, since low-usage Pokemon get inflated ratings from a small, self-selected sample. Recommendations use this."
                />
                <span className="ml-auto text-xs text-gray-400">{shown.length} Pokemon</span>
            </div>

            <div className={`mt-3 ${TABLE_WRAP}`}>
                <table className={TABLE}>
                    <thead className={THEAD}>
                        <tr>
                            <th className={`${TH} w-14`}>#</th>
                            <th className={TH}>Pokemon</th>
                            {columns.map((k) => (
                                <th key={k} className={TH}>
                                    {header(k)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.slice(0, visible).map((r, i) => (
                            <tr key={r.speciesId} className={TR}>
                                <td className={TD}>
                                    <RankBadge rank={i + 1} />
                                </td>
                                <td className={TD}>
                                    <div className="flex items-center gap-3">
                                        <Sprite speciesId={r.speciesId} />
                                        <div>
                                            <div className="font-semibold text-gray-900">{r.name}</div>
                                            <div className="mt-0.5 flex gap-1">
                                                <TypeBadge type={r.type1} />
                                                <TypeBadge type={r.type2} />
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                {columns.map((k) => (
                                    <td key={k} className={TD}>
                                        {cell(r, k)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {shown.length === 0 && (
                            <tr>
                                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-gray-500">
                                    No Pokemon match &ldquo;{query}&rdquo;.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {shown.length > visible && (
                <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE * 4)}
                    className="mt-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-gray-50"
                >
                    Show more ({shown.length - visible} remaining)
                </button>
            )}
        </div>
    );
}

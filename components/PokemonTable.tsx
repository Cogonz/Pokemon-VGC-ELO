'use client';

import Link from 'next/link';
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
    TrophyBadge,
    TypeBadge,
    UsageBar,
    WinBar,
} from '@/components/ui';
import { usageAdjustedScore } from '@/lib/recommend';

export interface PokemonRow {
    speciesId: string;
    name: string;
    rating: number | null; // match Elo + tournament-results bonus; null = no stored Elo for this Pokemon
    matchRating: number | null; // match Elo alone
    resultBonus: number;
    wins: number;
    losses: number;
    ties: number;
    matches: number;
    teams: number;
    usagePct: number;
    avgPercentile: number | null;
    titles: number; // tournaments won by a team carrying it
    topCuts: number; // top-8 finishes by teams carrying it (includes wins)
    type1: string | null;
    type2: string | null;
}

type SortKey = 'elo' | 'usage' | 'record' | 'finish' | 'titles';

const SORT_LABELS: Record<SortKey, string> = {
    elo: 'Elo',
    usage: 'Total usage',
    record: 'W-L record',
    finish: 'Avg finish',
    titles: 'Tournament wins',
};

// Win rate shrunk toward 50% (as if every Pokemon had 20 extra even games), so a 13-3 sample
// doesn't outrank a 1000-game record.
const winRate = (r: PokemonRow) => (r.wins + 10) / (r.matches + 20);

// The displayed/sorted Elo: raw, or shrunk toward 1500 by how rarely the Pokemon is played.
const eloOf = (r: PokemonRow, adjusted: boolean, results: boolean): number | null => {
    const base = results ? r.rating : r.matchRating;
    return base == null ? null : adjusted ? Math.round(usageAdjustedScore(base, r.usagePct)) : base;
};

// Descending for everything except average finish (lower percentile = better).
// Rows missing the sort value always go last.
const COMPARE: Record<SortKey, (a: PokemonRow, b: PokemonRow, adjusted: boolean, results: boolean) => number> = {
    elo: (a, b, adjusted, results) =>
        (eloOf(b, adjusted, results) ?? -Infinity) - (eloOf(a, adjusted, results) ?? -Infinity),
    usage: (a, b) => b.teams - a.teams,
    record: (a, b) => winRate(b) - winRate(a) || b.matches - a.matches,
    finish: (a, b) => (a.avgPercentile ?? Infinity) - (b.avgPercentile ?? Infinity),
    // Wins first, then top-8 finishes as the tiebreak (tournament history).
    titles: (a, b) => b.titles - a.titles || b.topCuts - a.topCuts,
};

const PAGE = 25;

export function PokemonTable({
    rows,
    sortOptions,
    defaultSort,
    columns,
    format,
}: {
    format: string | null;
    rows: PokemonRow[];
    sortOptions: SortKey[];
    defaultSort: SortKey;
    columns: SortKey[];
}) {
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>(defaultSort);
    const [visible, setVisible] = useState(PAGE);
    const [adjusted, setAdjusted] = useState(false);
    const [results, setResults] = useState(true);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
        return [...filtered].sort((a, b) => COMPARE[sort](a, b, adjusted, results) || a.name.localeCompare(b.name));
    }, [rows, query, sort, adjusted, results]);

    const { min, max } = useMemo(() => {
        const vals = rows.map((r) => eloOf(r, adjusted, results)).filter((v): v is number => v != null);
        return { min: Math.min(...vals), max: Math.max(...vals) };
    }, [rows, adjusted, results]);

    const header = (k: SortKey) =>
        k === 'usage' ? 'Usage (teams)' : k === 'elo' && adjusted ? 'Adj. Elo' : SORT_LABELS[k];

    const cell = (r: PokemonRow, key: SortKey) => {
        switch (key) {
            case 'elo': {
                const v = eloOf(r, adjusted, results);
                if (v == null) return <span className="text-gray-400">—</span>;
                return (
                    <div>
                        <EloBar value={v} min={min} max={max} />
                        <div className="mt-0.5 text-[11px] text-gray-400">
                            {adjusted ? `raw ${results ? r.rating : r.matchRating} · ` : ''}
                            {results && r.resultBonus > 0 ? `incl. +${r.resultBonus} results` : ''}
                        </div>
                    </div>
                );
            }
            case 'usage':
                return <UsageBar pct={r.usagePct} teams={r.teams} />;
            case 'record':
                return <WinBar wins={r.wins} losses={r.losses} ties={r.ties} />;
            case 'titles':
                return (
                    <div className="flex items-center gap-2">
                        <TrophyBadge count={r.titles} />
                        <span className="text-xs text-gray-500">{r.topCuts > 0 ? `${r.topCuts} top 8` : ''}</span>
                    </div>
                );
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
                <AdjustedToggle
                    checked={results}
                    onChange={setResults}
                    label="Tournament results"
                    help="Includes a bonus for teams this Pokemon was on that finished at the top of large tournaments, measured against the average team so popular Pokemon aren't rewarded just for being common. Turn off to see match Elo alone."
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
                                            <Link
                                                href={`/pokemon/${encodeURIComponent(r.speciesId)}${format ? `?format=${encodeURIComponent(format)}` : ''}`}
                                                className="font-semibold text-gray-900 hover:text-indigo-600 hover:underline"
                                            >
                                                {r.name}
                                            </Link>
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

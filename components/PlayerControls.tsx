'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdjustedToggle } from '@/components/AdjustedToggle';
import { SearchInput, SegmentedControl } from '@/components/ui';
import { PLAYER_SORTS, type PlayerSort } from '@/lib/leaderboards';

// The player list is too large (10k+ per regulation) to ship to the browser, so search and
// sort live in the URL (?pq=, ?ps=, ?pa=) and the server filters before rendering.
export function PlayerControls({
    query,
    sort,
    adjusted,
    results,
}: {
    query: string;
    sort: PlayerSort;
    adjusted: boolean;
    results: boolean;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [text, setText] = useState(query);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    function update(next: { pq?: string; ps?: string; pa?: string; pt?: string }) {
        const p = new URLSearchParams(params.toString());
        for (const [k, v] of Object.entries(next)) {
            if (v) p.set(k, v);
            else p.delete(k);
        }
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    }

    return (
        <div className="flex flex-wrap items-center gap-3">
            <SearchInput
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => update({ pq: e.target.value.trim() }), 300);
                }}
                placeholder="Search players"
                aria-label="Search players"
            />
            <SegmentedControl
                label="Sort by"
                value={sort}
                onChange={(v) => update({ ps: v === 'elo' ? '' : v })}
                options={(Object.entries(PLAYER_SORTS) as [PlayerSort, string][]).map(([value, label]) => ({
                    value,
                    label,
                }))}
            />
            <AdjustedToggle
                checked={adjusted}
                onChange={(on) => update({ pa: on ? '1' : '' })}
                help="Shrinks each rating toward 1500 based on how few matches back it, so a short hot streak doesn't outrank a proven record."
            />
            <AdjustedToggle
                checked={results}
                onChange={(on) => update({ pt: on ? '' : '0' })}
                label="Tournament results"
                help="Adds a bonus for top finishes at large tournaments (winner, finalist, top 4/8/16, weighted by field size, capped at +60). Turn off to see match Elo alone."
            />
        </div>
    );
}

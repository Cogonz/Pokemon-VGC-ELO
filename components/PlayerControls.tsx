'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const PLAYER_SORTS = { elo: 'Elo', matches: 'Total matches', record: 'W-L record' } as const;
export type PlayerSort = keyof typeof PLAYER_SORTS;

// The player list is too large (10k+ per regulation) to ship to the browser, so search and
// sort live in the URL (?pq=, ?ps=) and the server filters before rendering.
export function PlayerControls({ query, sort }: { query: string; sort: PlayerSort }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [text, setText] = useState(query);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    function update(next: { pq?: string; ps?: string }) {
        const p = new URLSearchParams(params.toString());
        for (const [k, v] of Object.entries(next)) {
            if (v) p.set(k, v);
            else p.delete(k);
        }
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    }

    return (
        <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
                type="search"
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => update({ pq: e.target.value.trim() }), 300);
                }}
                placeholder="Search players"
                aria-label="Search players"
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            />
            <label className="flex items-center gap-2 text-sm text-gray-500">
                Sort by
                <select
                    value={sort}
                    onChange={(e) => update({ ps: e.target.value === 'elo' ? '' : e.target.value })}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                >
                    {Object.entries(PLAYER_SORTS).map(([k, label]) => (
                        <option key={k} value={k}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

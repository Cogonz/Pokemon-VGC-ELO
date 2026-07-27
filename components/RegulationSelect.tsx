'use client';

import { useRouter } from 'next/navigation';
import type { FormatOption } from '@/lib/formats';

export function RegulationSelect({ options, selected }: { options: FormatOption[]; selected: string | null }) {
    const router = useRouter();

    if (options.length <= 1) return null; // nothing to switch between

    return (
        <select
            value={selected ?? ''}
            onChange={(e) => router.push(e.target.value ? `/?format=${encodeURIComponent(e.target.value)}` : '/')}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
        >
            {options.map((o) => (
                <option key={o.format} value={o.format}>
                    {o.format} ({o.tournaments})
                </option>
            ))}
        </select>
    );
}

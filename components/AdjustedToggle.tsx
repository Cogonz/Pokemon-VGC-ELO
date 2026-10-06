'use client';

// Shared switch for the usage-adjusted Elo view on the player and Pokemon tables.
export function AdjustedToggle({
    checked,
    onChange,
    help,
    label = 'Usage-adjusted Elo',
}: {
    checked: boolean;
    onChange: (on: boolean) => void;
    help: string;
    label?: string;
}) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-500" title={help}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
            {label}
            <span
                aria-label={help}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400"
            >
                ?
            </span>
        </label>
    );
}

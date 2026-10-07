// Small presentational pieces shared by the stats tables (server- and client-safe, no state).
import { TYPE_COLORS } from '@/lib/type-colors';

export const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm';
export const TABLE = 'w-full text-sm';
export const THEAD = 'bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
export const TH = 'px-4 py-3 whitespace-nowrap';
export const TR = 'border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50';
export const TD = 'px-4 py-3 align-middle';

const MEDALS = [
    { bg: 'linear-gradient(135deg,#fde68a,#f5b932)', fg: '#4a3600' }, // gold
    { bg: 'linear-gradient(135deg,#e5e9f0,#aab4c3)', fg: '#2a3342' }, // silver
    { bg: 'linear-gradient(135deg,#f0b27a,#c9773a)', fg: '#3d1e08' }, // bronze
];

export function RankBadge({ rank }: { rank: number | null }) {
    if (rank == null) return <span className="text-gray-400">—</span>;
    const medal = MEDALS[rank - 1];
    if (!medal) return <span className="tabular-nums text-gray-500">{rank}</span>;
    return (
        <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm"
            style={{ background: medal.bg, color: medal.fg }}
            aria-label={`Rank ${rank}`}
        >
            {rank}
        </span>
    );
}

function hue(name: string): number {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
    const initials = name
        .split(/[\s_\-.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || '?';
    return (
        <span
            className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
            style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue(name)} 50% 42%)` }}
            aria-hidden
        >
            {initials}
        </span>
    );
}

export function TypeBadge({ type }: { type: string | null | undefined }) {
    if (!type) return null;
    const c = TYPE_COLORS[type.toLowerCase()] ?? { bg: '#888', fg: '#fff' };
    return (
        <span
            className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: c.bg, color: c.fg }}
        >
            {type}
        </span>
    );
}

// Number with a thin bar showing where it sits between the lowest and highest rating on the page.
export function EloBar({ value, min, max }: { value: number; min: number; max: number }) {
    const pct = max > min ? Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100)) : 100;
    return (
        <div className="min-w-[64px]">
            <div className="font-semibold tabular-nums text-gray-900">{value}</div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

// Win / tie / loss split as a segmented bar, with the record and win rate beside it.
export function WinBar({ wins, losses, ties }: { wins: number; losses: number; ties: number }) {
    const total = wins + losses + ties;
    if (total === 0) return <span className="text-gray-400">—</span>;
    const pct = (n: number) => `${(n / total) * 100}%`;
    return (
        <div className="min-w-[110px]">
            <div className="flex items-baseline gap-2 tabular-nums">
                <span className="font-medium text-gray-900">
                    {wins}–{losses}
                    {ties > 0 ? `–${ties}` : ''}
                </span>
                <span className="text-xs text-gray-500">{((wins / total) * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="bg-emerald-500" style={{ width: pct(wins) }} />
                <div className="bg-gray-400" style={{ width: pct(ties) }} />
                <div className="bg-rose-400" style={{ width: pct(losses) }} />
            </div>
        </div>
    );
}

export function UsageBar({ pct, teams }: { pct: number; teams: number }) {
    return (
        <div className="min-w-[96px]">
            <div className="flex items-baseline gap-2 tabular-nums">
                <span className="font-medium text-gray-900">{pct.toFixed(1)}%</span>
                <span className="text-xs text-gray-500">{teams.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
        </div>
    );
}

export function TrophyBadge({ count }: { count: number }) {
    if (count <= 0) return <span className="text-gray-400">—</span>;
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'linear-gradient(135deg,#fde68a,#f5b932)', color: '#4a3600' }}
            title={`${count} tournament win${count === 1 ? '' : 's'}`}
        >
            <span aria-hidden>🏆</span>
            {count}
        </span>
    );
}

export function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
    label,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    label: string;
}) {
    return (
        <div role="group" aria-label={label} className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    aria-pressed={o.value === value}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        o.value === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                ⌕
            </span>
            <input
                type="search"
                {...props}
                className="w-56 rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
        </div>
    );
}

// A ranked list of labels with a share-of-teams bar, used for moves/items/abilities/teammates.
const LOW_SAMPLE_TEAMS = 50; // impact estimates need this many teams on BOTH sides of the comparison

function ImpactBadge({ impact, teams, altTeams }: { impact: number; teams: number; altTeams: number }) {
    const low = teams < LOW_SAMPLE_TEAMS || altTeams < LOW_SAMPLE_TEAMS;
    const tone = low ? 'bg-gray-100 text-gray-400' : impact >= 10 ? 'bg-emerald-100 text-emerald-700' : impact <= -10 ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500';
    const sign = impact > 0 ? `+${impact}` : impact < 0 ? `-${Math.abs(impact)}` : '0';
    return (
        <span
            className={`ml-2 rounded px-1.5 py-px text-[11px] font-semibold tabular-nums ${tone}`}
            title={
                low
                    ? `Only ${teams} teams with it and ${altTeams} with the alternatives: too few to trust this comparison`
                    : `Teams using this did about ${sign} Elo ${impact >= 0 ? 'better' : 'worse'} than teams using this Pokemon's alternatives (${teams} vs ${altTeams} teams), after adjusting for player skill`
            }
        >
            {impact > 0 ? `+${impact}` : impact < 0 ? `−${Math.abs(impact)}` : '±0'}
        </span>
    );
}

export function BarList({
    title,
    entries,
    hint,
}: {
    title: string;
    entries: { label: string; teams: number; pct: number; impact?: number | null; altTeams?: number }[];
    hint?: string;
}) {
    if (entries.length === 0) return null;
    return (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
            <ul className="mt-3 space-y-2.5">
                {entries.map((e) => (
                    <li key={e.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate text-gray-800">
                                {e.label}
                                {e.impact != null && <ImpactBadge impact={e.impact} teams={e.teams} altTeams={e.altTeams ?? 0} />}
                            </span>
                            <span className="shrink-0 tabular-nums text-gray-500">
                                {e.pct.toFixed(e.pct >= 10 ? 0 : 1)}%{' '}
                                <span className="text-xs text-gray-400">({e.teams.toLocaleString()})</span>
                            </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, e.pct)}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

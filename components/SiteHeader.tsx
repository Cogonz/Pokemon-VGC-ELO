'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormatOption } from '@/lib/formats';
import { ThemeToggle } from '@/components/ThemeToggle';

const LINKS = [
    { href: '/', label: 'Home' },
    { href: '/players', label: 'Players' },
    { href: '/pokemon', label: 'Pokemon' },
    { href: '/teambuilder', label: 'Team Builder' },
];

// The regulation lives in the URL (?format=) so every page can be linked to directly. The nav
// carries it between pages and the selector rewrites it, dropping page-specific params
// (player search/sort) that belong to the previous regulation.
export function SiteHeader({
    options,
    current,
    children,
}: {
    options: FormatOption[];
    current: string | null;
    children?: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const params = useSearchParams();
    const selected = params.get('format') ?? current;
    const suffix = params.get('format') ? `?format=${encodeURIComponent(params.get('format')!)}` : '';

    return (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
            <nav className="flex gap-4 text-sm font-medium text-gray-600">
                {LINKS.map((l) => {
                    const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
                    return (
                        <Link
                            key={l.href}
                            href={`${l.href}${suffix}`}
                            aria-current={active ? 'page' : undefined}
                            className={active ? 'text-gray-900' : 'hover:text-gray-900'}
                        >
                            {l.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="flex items-center gap-4">
                {options.length > 1 && (
                    <label className="flex items-center gap-2 text-sm text-gray-500">
                        Regulation
                        <select
                            value={selected ?? ''}
                            onChange={(e) => router.push(`${pathname}?format=${encodeURIComponent(e.target.value)}`)}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                        >
                            {options.map((o) => (
                                <option key={o.format} value={o.format}>
                                    {o.format} ({o.tournaments})
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <ThemeToggle />
                {children}
            </div>
        </header>
    );
}

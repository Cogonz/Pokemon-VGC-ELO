'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

// Preference order: saved choice, then the OS setting. The pre-paint script in app/layout.tsx
// applies it before hydration so there's no flash; this just reflects and changes it.
export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme | null>(null);

    useEffect(() => {
        setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }, []);

    function toggle() {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark', next === 'dark');
        try {
            localStorage.setItem('theme', next);
        } catch {
            // storage can be blocked; the choice just won't persist
        }
        setTheme(next);
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
        >
            {theme === 'dark' ? '☀' : '☾'}
        </button>
    );
}

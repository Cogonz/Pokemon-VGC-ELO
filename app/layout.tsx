import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthStatus } from '@/components/AuthStatus';
import { SiteHeader } from '@/components/SiteHeader';
import { getAvailableFormats } from '@/lib/formats';

export const metadata: Metadata = {
    title: 'Pokemon VGC ELO',
    description: 'VGC teambuilding and usage stats',
};

// Runs before first paint so dark mode doesn't flash: saved choice, else the OS preference.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const { options, current } = await getAvailableFormats();
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body>
                <Suspense fallback={<header className="border-b px-6 py-3 text-sm">&nbsp;</header>}>
                    <SiteHeader options={options} current={current}>
                        <AuthStatus />
                    </SiteHeader>
                </Suspense>
                {children}
            </body>
        </html>
    );
}

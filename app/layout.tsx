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

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const { options, current } = await getAvailableFormats();
    return (
        <html lang="en">
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

'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PokemonUsage } from '@/lib/stats';

export function UsageChart({ data }: { data: PokemonUsage[] }) {
    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-40} textAnchor="end" interval={0} height={60} tick={{ fontSize: 12 }} />
                <YAxis unit="%" width={40} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                <Bar dataKey="usagePct" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PokemonUsage } from '@/lib/stats';

// Colors are CSS variables so the chart follows the light/dark theme (app/globals.css).
const AXIS = { fontSize: 12, fill: 'var(--color-gray-500)' };

export function UsageChart({ data }: { data: PokemonUsage[] }) {
    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-gray-200)" />
                <XAxis
                    dataKey="name"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={60}
                    tick={AXIS}
                    stroke="var(--color-gray-300)"
                />
                <YAxis unit="%" width={40} tick={AXIS} stroke="var(--color-gray-300)" />
                <Tooltip
                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                    contentStyle={{
                        background: 'var(--color-white)',
                        border: '1px solid var(--color-gray-200)',
                        color: 'var(--color-gray-900)',
                    }}
                    labelStyle={{ color: 'var(--color-gray-900)' }}
                    cursor={{ fill: 'var(--color-gray-100)' }}
                />
                <Bar dataKey="usagePct" name="Usage" fill="var(--color-indigo-600)" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

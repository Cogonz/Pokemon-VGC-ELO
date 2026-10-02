import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { checkMutationOrigin } from '@/lib/api-guards';
import { deleteSavedTeam, getSavedTeam } from '@/lib/teams';

export const dynamic = 'force-dynamic';

function parseId(id: string): number | null {
    // Strict: digits only, within Postgres INT range.
    if (!/^\d{1,9}$/.test(id)) return null;
    return Number(id);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = parseId((await params).id);
    if (teamId === null) return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });

    const team = await getSavedTeam(userId, teamId);
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(team);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const forbidden = checkMutationOrigin(request);
    if (forbidden) return forbidden;

    const teamId = parseId((await params).id);
    if (teamId === null) return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });

    // Same 404 whether the team doesn't exist or belongs to someone else.
    const deleted = await deleteSavedTeam(userId, teamId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}

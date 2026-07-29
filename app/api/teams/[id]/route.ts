import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteSavedTeam } from '@/lib/teams';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const teamId = Number(id);
    if (!Number.isInteger(teamId)) return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });

    const deleted = await deleteSavedTeam(session.user.id, teamId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
}

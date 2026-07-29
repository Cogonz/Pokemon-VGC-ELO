import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { SaveTeamRequest } from '@/schemas';
import { createSavedTeam, listSavedTeams } from '@/lib/teams';

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teams = await listSavedTeams(session.user.id);
    return NextResponse.json(teams);
}

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = SaveTeamRequest.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const team = await createSavedTeam(session.user.id, parsed.data);
    return NextResponse.json(team, { status: 201 });
}

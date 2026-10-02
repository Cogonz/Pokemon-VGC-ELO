import { NextRequest, NextResponse } from 'next/server';
import { SaveTeamRequest } from '@/schemas';
import { getUserId } from '@/lib/session';
import { checkMutationOrigin, readJsonBody } from '@/lib/api-guards';
import { MAX_TEAMS_PER_USER, createSavedTeam, listSavedTeams } from '@/lib/teams';

export const dynamic = 'force-dynamic';

export async function GET() {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(await listSavedTeams(userId));
}

export async function POST(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const forbidden = checkMutationOrigin(request);
    if (forbidden) return forbidden;

    const read = await readJsonBody(request);
    if (!read.ok) return read.res;

    const parsed = SaveTeamRequest.safeParse(read.body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid team', details: parsed.error.flatten() }, { status: 400 });
    }

    const team = await createSavedTeam(userId, parsed.data);
    if (!team) {
        return NextResponse.json({ error: `Team limit reached (${MAX_TEAMS_PER_USER}). Delete one first.` }, { status: 409 });
    }
    return NextResponse.json(team, { status: 201 });
}

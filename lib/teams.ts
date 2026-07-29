import { prisma } from './prisma';
import type { SaveTeamRequest } from '@/schemas';

export interface SavedTeam {
    id: number;
    name: string;
    pokemon: SaveTeamRequest['pokemon'];
    createdAt: string;
}

export async function listSavedTeams(userId: string): Promise<SavedTeam[]> {
    const rows = await prisma.saved_teams.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        pokemon: r.pokemon as SaveTeamRequest['pokemon'],
        createdAt: r.created_at.toISOString(),
    }));
}

export async function createSavedTeam(userId: string, input: SaveTeamRequest): Promise<SavedTeam> {
    const row = await prisma.saved_teams.create({
        data: {
            user_id: userId,
            name: input.name,
            pokemon: input.pokemon,
        },
    });
    return {
        id: row.id,
        name: row.name,
        pokemon: row.pokemon as SaveTeamRequest['pokemon'],
        createdAt: row.created_at.toISOString(),
    };
}

// Scoped by user_id in the same query, not checked afterward -- deleting
// someone else's team by guessing an id just matches zero rows rather than
// needing a separate ownership check.
export async function deleteSavedTeam(userId: string, teamId: number): Promise<boolean> {
    const result = await prisma.saved_teams.deleteMany({
        where: { id: teamId, user_id: userId },
    });
    return result.count > 0;
}

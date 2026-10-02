import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { SaveTeamRequest } from '@/schemas';

export const MAX_TEAMS_PER_USER = 50;

export interface SavedTeam {
    id: number;
    name: string;
    pokemon: SaveTeamRequest['pokemon'];
    createdAt: string;
}

function toSavedTeam(r: { id: number; name: string; pokemon: Prisma.JsonValue; created_at: Date }): SavedTeam {
    return { id: r.id, name: r.name, pokemon: r.pokemon as SaveTeamRequest['pokemon'], createdAt: r.created_at.toISOString() };
}

// Every query is scoped by user_id in the WHERE clause itself, so another user's team id
// simply matches zero rows -- no separate (racy) ownership check.
export async function listSavedTeams(userId: string): Promise<SavedTeam[]> {
    const rows = await prisma.saved_teams.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: MAX_TEAMS_PER_USER,
    });
    return rows.map(toSavedTeam);
}

export async function getSavedTeam(userId: string, teamId: number): Promise<SavedTeam | null> {
    const row = await prisma.saved_teams.findFirst({ where: { id: teamId, user_id: userId } });
    return row ? toSavedTeam(row) : null;
}

// Returns null when the per-user cap is hit. Serializable so concurrent requests can't
// race past the cap.
export async function createSavedTeam(userId: string, input: SaveTeamRequest): Promise<SavedTeam | null> {
    return prisma.$transaction(
        async (tx) => {
            const count = await tx.saved_teams.count({ where: { user_id: userId } });
            if (count >= MAX_TEAMS_PER_USER) return null;
            const row = await tx.saved_teams.create({
                data: { user_id: userId, name: input.name, pokemon: input.pokemon as unknown as Prisma.InputJsonValue },
            });
            return toSavedTeam(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
}

export async function deleteSavedTeam(userId: string, teamId: number): Promise<boolean> {
    const result = await prisma.saved_teams.deleteMany({ where: { id: teamId, user_id: userId } });
    return result.count > 0;
}

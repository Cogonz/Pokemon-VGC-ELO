import { prisma } from './prisma';

export interface PlayerElo {
    player: string;
    name: string;
    rating: number;
    wins: number;
    losses: number;
    ties: number;
}

interface MatchRow {
    player1: string;
    player2: string;
    winner: string | null;
}

interface PlayerRecord {
    wins: number;
    losses: number;
    ties: number;
}

// Standard Elo, replayed across every stored match in chronological order (by
// tournament date, then phase/round within it) so a player's rating carries
// over between tournaments instead of resetting each time.
export async function computePlayerElo(format: string | null, k = 32, base = 1500): Promise<PlayerElo[]> {
    const matches = await prisma.$queryRaw<MatchRow[]>`
        SELECT m.player1, m.player2, m.winner
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        WHERE (${format}::text IS NULL OR t.format = ${format})
        ORDER BY t.date ASC NULLS LAST, m.phase ASC, m.round ASC, m.id ASC
    `;

    const rating = new Map<string, number>();
    const record = new Map<string, PlayerRecord>();

    const getRecord = (player: string): PlayerRecord => {
        let r = record.get(player);
        if (!r) {
            r = { wins: 0, losses: 0, ties: 0 };
            record.set(player, r);
        }
        return r;
    };

    for (const m of matches) {
        const r1 = rating.get(m.player1) ?? base;
        const r2 = rating.get(m.player2) ?? base;
        const e1 = 1 / (1 + 10 ** ((r2 - r1) / 400));
        const s1 = m.winner === null ? 0.5 : m.winner === m.player1 ? 1 : 0;

        rating.set(m.player1, r1 + k * (s1 - e1));
        rating.set(m.player2, r2 + k * (1 - s1 - (1 - e1)));

        const rec1 = getRecord(m.player1);
        const rec2 = getRecord(m.player2);
        if (s1 === 0.5) {
            rec1.ties++;
            rec2.ties++;
        } else if (s1 === 1) {
            rec1.wins++;
            rec2.losses++;
        } else {
            rec1.losses++;
            rec2.wins++;
        }
    }

    const names = await prisma.$queryRaw<{ player: string; name: string }[]>`
        SELECT DISTINCT ON (s.player) s.player, s.name
        FROM standings s
        JOIN tournaments t ON t.id = s.tournament_id
        WHERE (${format}::text IS NULL OR t.format = ${format})
        ORDER BY s.player, t.date DESC NULLS LAST
    `;
    const nameByPlayer = new Map(names.map((n) => [n.player, n.name]));

    return [...rating.entries()]
        .map(([player, r]) => {
            const rec = getRecord(player);
            return {
                player,
                name: nameByPlayer.get(player) ?? player,
                rating: Math.round(r),
                wins: rec.wins,
                losses: rec.losses,
                ties: rec.ties,
            };
        })
        .sort((a, b) => b.rating - a.rating);
}

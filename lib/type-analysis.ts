import { TYPE_CHART, ALL_TYPES } from './type-chart';

export interface TeamWeakness {
    type: string;
    weakCount: number; // how many team members take >=2x from this type
    teamSize: number;
    hasAnswer: boolean; // does any team member resist (0.5x) or is immune (0x) to this type
}

function multiplier(defenderType: string, attackingType: string): number {
    const rel = TYPE_CHART[defenderType];
    if (!rel) return 1;
    if (rel.zeroFrom.includes(attackingType)) return 0;
    if (rel.doubleFrom.includes(attackingType)) return 2;
    if (rel.halfFrom.includes(attackingType)) return 0.5;
    return 1;
}

// Dual types multiply: e.g. Water/Ground vs Electric is 2x (Water) * 0x
// (Ground) = 0x overall -- Ground's immunity cancels Water's weakness
// entirely, matching real game mechanics.
export function effectiveness(defenderTypes: (string | null | undefined)[], attackingType: string): number {
    return defenderTypes
        .filter((t): t is string => !!t)
        .reduce((mult, t) => mult * multiplier(t, attackingType), 1);
}

// For each attacking type, how many team members are weak to it (>=2x) and
// whether anything on the team resists/is immune. Sorted so complete gaps
// (no answer anywhere on the team) rank above partial ones, since "we get
// swept by this type" is a worse problem than "this type is merely annoying."
export function analyzeTeamWeaknesses(teamTypes: { type1: string; type2: string | null }[]): TeamWeakness[] {
    if (teamTypes.length === 0) return [];

    return ALL_TYPES.map((type) => {
        let weakCount = 0;
        let hasAnswer = false;
        for (const t of teamTypes) {
            const eff = effectiveness([t.type1, t.type2], type);
            if (eff >= 2) weakCount++;
            if (eff < 1) hasAnswer = true;
        }
        return { type, weakCount, teamSize: teamTypes.length, hasAnswer };
    })
        .filter((w) => w.weakCount > 0)
        .sort((a, b) => {
            if (a.hasAnswer !== b.hasAnswer) return a.hasAnswer ? 1 : -1;
            return b.weakCount - a.weakCount;
        });
}

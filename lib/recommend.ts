// Pokemon Elo is fit from match results, so a Pokemon that only a handful of strong players
// bring can look better than one that's proven across thousands of teams: low usage means a
// small, self-selected sample. Recommendations therefore rank by a usage-adjusted score that
// shrinks a Pokemon's Elo edge (over the 1500 baseline) in proportion to how rarely it's
// played. The Elo displayed everywhere else is unchanged; this only orders suggestions.
//
// weight = usage / (usage + USAGE_PRIOR_PCT): at USAGE_PRIOR_PCT (3%) a Pokemon keeps half its
// edge, at 10% ~77%, at 30% ~91%.
export const USAGE_PRIOR_PCT = 3;
const BASELINE_ELO = 1500;

export function usageAdjustedScore(rating: number, usagePct: number): number {
    const weight = usagePct / (usagePct + USAGE_PRIOR_PCT);
    return BASELINE_ELO + (rating - BASELINE_ELO) * weight;
}

// Players have the same problem from the other side: a rating built on a few matches is noisy,
// so a player who went 9-0 in one event can outrank someone proven over hundreds of games.
// Their "usage" is how many matches back the rating; at PLAYER_PRIOR_MATCHES a player keeps
// half their edge over 1500.
export const PLAYER_PRIOR_MATCHES = 20;

export function matchAdjustedScore(rating: number, matches: number): number {
    const weight = matches / (matches + PLAYER_PRIOR_MATCHES);
    return BASELINE_ELO + (rating - BASELINE_ELO) * weight;
}

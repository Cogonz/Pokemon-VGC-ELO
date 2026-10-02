import z from 'zod'

// Schemas for Intaking from Limitless

const LimitlessPokemon = z.object({
    id: z.string(),
    name: z.string(),
    item: z.string().nullish(),
    ability: z.string().nullish(),
    attacks: z.array(z.string()).default([]),
    nature: z.string().nullish(),
    tera: z.string().nullish()
})

const LimitlessStanding = z.object({
    player: z.string(),
    name: z.string(),
    placing: z.number().nullable(),
    record: z.object({
        wins: z.number(),
        losses: z.number(),
        ties: z.number()
    }),
    decklist: z.array(LimitlessPokemon).nullish()
});

export const StandingsResponse = z.array(LimitlessStanding);
export type StandingsResponse = z.infer<typeof StandingsResponse>

const LimitlessPairing = z.object({
    phase: z.number(),
    round: z.number(),
    player1: z.string().nullish(),
    player2: z.string().nullish(),
    // Player id of the winner; 0 = tie; -1 = double loss / no-show.
    winner: z.union([z.string(), z.number()]).nullish()
});

export const PairingsResponse = z.array(LimitlessPairing);
export type PairingsResponse = z.infer<typeof PairingsResponse>

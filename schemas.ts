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


// Schemas for Intaking Uesr Team Data

const PokemonTeamInput = z.object({
    speciesID: z.string().min(1),
    item: z.string().nullable(),
    ability: z.string().nullable(),
    nature: z.string().nullable(),
    tera: z.string().nullish(),
    moves: z.array(z.string()).max(4)
}).strict();

export const SaveTeamRequest = z.object({
    name: z.string().min(1).max(50),
    pokemon: z.array(PokemonTeamInput).min(1).max(6)
}).strict();

export type SaveTeamRequest = z.infer<typeof SaveTeamRequest>;
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
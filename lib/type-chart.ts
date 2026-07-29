// Source: PokeAPI /type/{name} damage_relations, fetched and verified 2026-07.
// For a defending Pokemon of TYPE, damage taken from an attack of ATTACKING_TYPE is:
//   2x   if ATTACKING_TYPE is in doubleFrom
//   0.5x if ATTACKING_TYPE is in halfFrom
//   0x   if ATTACKING_TYPE is in zeroFrom
//   1x   otherwise
export const TYPE_CHART: Record<string, { doubleFrom: string[]; halfFrom: string[]; zeroFrom: string[] }> = {
    normal: {
        doubleFrom: ['fighting'],
        halfFrom: [],
        zeroFrom: ['ghost'],
    },
    fighting: {
        doubleFrom: ['fairy', 'flying', 'psychic'],
        halfFrom: ['bug', 'dark', 'rock'],
        zeroFrom: [],
    },
    flying: {
        doubleFrom: ['electric', 'ice', 'rock'],
        halfFrom: ['bug', 'fighting', 'grass'],
        zeroFrom: ['ground'],
    },
    poison: {
        doubleFrom: ['ground', 'psychic'],
        halfFrom: ['bug', 'fairy', 'fighting', 'grass', 'poison'],
        zeroFrom: [],
    },
    ground: {
        doubleFrom: ['grass', 'ice', 'water'],
        halfFrom: ['poison', 'rock'],
        zeroFrom: ['electric'],
    },
    rock: {
        doubleFrom: ['fighting', 'grass', 'ground', 'steel', 'water'],
        halfFrom: ['fire', 'flying', 'normal', 'poison'],
        zeroFrom: [],
    },
    bug: {
        doubleFrom: ['fire', 'flying', 'rock'],
        halfFrom: ['fighting', 'grass', 'ground'],
        zeroFrom: [],
    },
    ghost: {
        doubleFrom: ['dark', 'ghost'],
        halfFrom: ['bug', 'poison'],
        zeroFrom: ['fighting', 'normal'],
    },
    steel: {
        doubleFrom: ['fighting', 'fire', 'ground'],
        halfFrom: ['bug', 'dragon', 'fairy', 'flying', 'grass', 'ice', 'normal', 'psychic', 'rock', 'steel'],
        zeroFrom: ['poison'],
    },
    fire: {
        doubleFrom: ['ground', 'rock', 'water'],
        halfFrom: ['bug', 'fairy', 'fire', 'grass', 'ice', 'steel'],
        zeroFrom: [],
    },
    water: {
        doubleFrom: ['electric', 'grass'],
        halfFrom: ['fire', 'ice', 'steel', 'water'],
        zeroFrom: [],
    },
    grass: {
        doubleFrom: ['bug', 'fire', 'flying', 'ice', 'poison'],
        halfFrom: ['electric', 'grass', 'ground', 'water'],
        zeroFrom: [],
    },
    electric: {
        doubleFrom: ['ground'],
        halfFrom: ['electric', 'flying', 'steel'],
        zeroFrom: [],
    },
    psychic: {
        doubleFrom: ['bug', 'dark', 'ghost'],
        halfFrom: ['fighting', 'psychic'],
        zeroFrom: [],
    },
    ice: {
        doubleFrom: ['fighting', 'fire', 'rock', 'steel'],
        halfFrom: ['ice'],
        zeroFrom: [],
    },
    dragon: {
        doubleFrom: ['dragon', 'fairy', 'ice'],
        halfFrom: ['electric', 'fire', 'grass', 'water'],
        zeroFrom: [],
    },
    dark: {
        doubleFrom: ['bug', 'fairy', 'fighting'],
        halfFrom: ['dark', 'ghost'],
        zeroFrom: ['psychic'],
    },
    fairy: {
        doubleFrom: ['poison', 'steel'],
        halfFrom: ['bug', 'dark', 'fighting'],
        zeroFrom: ['dragon'],
    },
};

export const ALL_TYPES = Object.keys(TYPE_CHART);

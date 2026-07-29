import { prisma } from './prisma';

export interface SpeciesTypes {
    type1: string;
    type2: string | null;
}

export async function getSpeciesTypeMap(): Promise<Record<string, SpeciesTypes>> {
    const rows = await prisma.pokemon_species.findMany();
    const map: Record<string, SpeciesTypes> = {};
    for (const r of rows) map[r.species_id] = { type1: r.type1, type2: r.type2 };
    return map;
}

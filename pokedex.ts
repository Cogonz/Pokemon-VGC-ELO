import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

// Sources species-type and move-type/category reference data from PokeAPI,
// keyed by whatever species_id/move-name values we've actually ingested from
// Limitless -- not a full Pokedex. The type effectiveness chart itself is
// static and lives in lib/type-chart.ts, sourced once and hardcoded rather
// than fetched here.
// Docs: https://pokeapi.co/docs/v2

const BASE = 'https://pokeapi.co/api/v2';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_DELAY_MS = 100;
const MAX_RETRIES = 3;

async function pokeapiGet<T>(path: string): Promise<T | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        await sleep(REQUEST_DELAY_MS);
        const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': 'vgc-elo/0.1' } });
        if (res.status === 404 || res.status === 400) return null; // no reconciliation match, or a slug PokeAPI can't parse -- either way, unresolved
        if (res.status === 429 || res.status >= 500) {
            // 429 (rate limited) and 5xx (transient server error, e.g. a 502)
            // both warrant a retry -- an unattended monthly run has nobody
            // watching to re-trigger it if a brief upstream hiccup kills the
            // whole sync partway through.
            await sleep(2 ** attempt * 1000);
            continue;
        }
        if (!res.ok) throw new Error(`PokeAPI ${path} failed: ${res.status} ${res.statusText}`);
        return res.json() as Promise<T>;
    }
    throw new Error(`PokeAPI ${path} failed: still failing after ${MAX_RETRIES} retries`);
}

// Our ingested move names have inconsistent casing ("Dire claw" vs "Dire
// Claw") and stray punctuation ("Forest's Curse") -- normalizing to PokeAPI's
// slug format also naturally merges those duplicates onto the same reference row.
function toSlug(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/\s+/g, '-');
}

function slugToDisplayName(slug: string): string {
    return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

interface PokeApiPokemon {
    types: { slot: number; type: { name: string } }[];
}

interface PokeApiSpecies {
    varieties: { is_default: boolean; pokemon: { name: string } }[];
}

interface PokeApiMove {
    type: { name: string };
    damage_class: { name: string } | null;
    power: number | null;
}

// Our species_id values (from Limitless) don't always match PokeAPI's resource
// names for non-base forms. Three-step fallback, discovered by inspecting the
// actual misses on a first pass:
//   1. /pokemon/{id} directly (covers the vast majority)
//   2. {id} is a species with a differently-named default variety (e.g. our
//      "aegislash" -> PokeAPI's default variety "aegislash-shield")
//   3. {id} has trailing qualifiers PokeAPI doesn't use (e.g. our
//      "calyrex-ice-rider" -> PokeAPI's "calyrex-ice") -- strip one trailing
//      "-word" at a time and retry step 1
async function resolvePokemon(speciesId: string): Promise<PokeApiPokemon | null> {
    const direct = await pokeapiGet<PokeApiPokemon>(`/pokemon/${speciesId}`);
    if (direct) return direct;

    const species = await pokeapiGet<PokeApiSpecies>(`/pokemon-species/${speciesId}`);
    if (species) {
        const defaultVariety = species.varieties.find((v) => v.is_default) ?? species.varieties[0];
        if (defaultVariety) {
            const viaSpecies = await pokeapiGet<PokeApiPokemon>(`/pokemon/${defaultVariety.pokemon.name}`);
            if (viaSpecies) return viaSpecies;
        }
    }

    const parts = speciesId.split('-');
    if (parts.length > 1) {
        return resolvePokemon(parts.slice(0, -1).join('-'));
    }

    return null;
}

async function syncSpeciesTypes(): Promise<{ resolved: number; missing: string[] }> {
    const { rows } = await pool.query<{ species_id: string }>(
        'SELECT DISTINCT species_id FROM team_pokemon ORDER BY species_id'
    );

    const missing: string[] = [];
    let resolved = 0;

    for (let i = 0; i < rows.length; i++) {
        const { species_id } = rows[i];
        const data = await resolvePokemon(species_id);
        if (!data) {
            missing.push(species_id);
            console.log(`  [${i + 1}/${rows.length}] MISSING: ${species_id}`);
            continue;
        }

        const sorted = [...data.types].sort((a, b) => a.slot - b.slot);
        const type1 = sorted[0]?.type.name;
        const type2 = sorted[1]?.type.name ?? null;
        if (!type1) {
            missing.push(species_id);
            console.log(`  [${i + 1}/${rows.length}] MISSING (no types): ${species_id}`);
            continue;
        }

        await pool.query(
            `INSERT INTO pokemon_species (species_id, type1, type2)
             VALUES ($1, $2, $3)
             ON CONFLICT (species_id) DO UPDATE SET type1 = $2, type2 = $3`,
            [species_id, type1, type2]
        );
        resolved++;
        if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${rows.length}] ...`);
    }

    return { resolved, missing };
}

async function syncMoves(): Promise<{ resolved: number; missing: string[] }> {
    const { rows } = await pool.query<{ m: string }>(
        `SELECT DISTINCT m FROM team_pokemon, unnest(moves) AS m WHERE m != ''`
    );

    const slugList = [...new Set(rows.map((r) => toSlug(r.m)))];
    const missing: string[] = [];
    let resolved = 0;

    for (let i = 0; i < slugList.length; i++) {
        const slug = slugList[i];
        const data = await pokeapiGet<PokeApiMove>(`/move/${slug}`);
        if (!data || !data.damage_class) {
            missing.push(slug);
            console.log(`  [${i + 1}/${slugList.length}] MISSING: ${slug}`);
            continue;
        }

        await pool.query(
            `INSERT INTO move_reference (move_slug, display_name, type, damage_class, power)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (move_slug) DO UPDATE SET display_name = $2, type = $3, damage_class = $4, power = $5`,
            [slug, slugToDisplayName(slug), data.type.name, data.damage_class.name, data.power]
        );
        resolved++;
        if ((i + 1) % 100 === 0) console.log(`  [${i + 1}/${slugList.length}] ...`);
    }

    return { resolved, missing };
}

async function main() {
    console.log('Syncing species types...');
    const species = await syncSpeciesTypes();
    console.log(`  resolved ${species.resolved}, missing ${species.missing.length}`);
    if (species.missing.length > 0) console.log('  missing species_ids:', species.missing.join(', '));

    console.log('Syncing move reference data...');
    const moves = await syncMoves();
    console.log(`  resolved ${moves.resolved}, missing ${moves.missing.length}`);
    if (moves.missing.length > 0) console.log('  missing move slugs:', moves.missing.join(', '));

    await pool.end();
}

const isMainModule = process.argv[1] != null && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);

if (isMainModule) {
    main().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

'use client';

import { useState } from 'react';

// Pokemon Showdown's gen5 sprite set, keyed by slug. Our species ids mostly match; mega forms
// drop the hyphen before X/Y. If a sprite is missing we just render an empty box, never a broken image.
export function Sprite({ speciesId, size = 40 }: { speciesId: string; size?: number }) {
    const [failed, setFailed] = useState(false);
    const slug = speciesId.replace(/-mega-([xy])$/, '-mega$1');
    return (
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
            {!failed && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`}
                    alt=""
                    width={size}
                    height={size}
                    loading="lazy"
                    onError={() => setFailed(true)}
                    className="max-h-full max-w-full object-contain"
                />
            )}
        </span>
    );
}

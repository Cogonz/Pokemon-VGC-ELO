// Limitless decklists are free text, so the same item/ability/nature/move shows up as "Intimidate",
// "intimidate" and " Intimidate " on different teams. Treat them as one value everywhere: match on
// `normKey`, and display the most common spelling.
export const normKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export class Canonicalizer {
    private counts = new Map<string, Map<string, number>>();

    add(raw: string): void {
        const display = raw.trim().replace(/\s+/g, ' ');
        const key = display.toLowerCase();
        let variants = this.counts.get(key);
        if (!variants) this.counts.set(key, (variants = new Map()));
        variants.set(display, (variants.get(display) ?? 0) + 1);
    }

    // Most common spelling for the value's normalized key (ties broken alphabetically for stability).
    display(raw: string): string {
        const key = normKey(raw);
        const variants = this.counts.get(key);
        if (!variants) return raw.trim();
        return [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    }
}

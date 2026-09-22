import type { Flag } from './model';

export function filterFlags(flags: Iterable<Flag>, query: string): Flag[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return [...flags].filter(flag => {
    const text = `${flag.name} ${flag.project} ${flag.description ?? ''}`.toLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name));
}

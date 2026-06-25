// Catalog registry + manifest loading.
//
// A "catalog" is one asset pack the editor can load. The dropdown lists the
// entries in CATALOGS; selecting one fetches its manifest (built by
// build/build-catalog.py) which groups the pack's models into categories.
//
// To add another pack later: copy its assets into assets/<id>/, run the
// build script to emit catalogs/<id>.json, then add an entry here.
export const CATALOGS = [
  { id: 'restaurant-bits', name: 'Restaurant Bits 1.0 EXTRA', manifest: 'catalogs/restaurant-bits.json' },
  { id: 'furniture-bits', name: 'Furniture Bits 1.0 (interiors)', manifest: 'catalogs/furniture-bits.json' },
];

export async function loadManifest(entry) {
  const r = await fetch(entry.manifest, { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to load catalog: ' + entry.manifest + ' (' + r.status + ')');
  return r.json();
}

/** Human-friendly label for a raw model name. */
export function label(name) {
  const s = name
    .replace(/^food_ingredient_/, '')
    .replace(/^food_/, '')
    .replace(/^kitchencounter_/, 'counter ')
    .replace(/^kitchencabinet_/, 'cabinet ')
    .replace(/^kitchentable_/, 'table ')
    .replace(/styleB/g, 'style B')
    .replace(/_/g, ' ')
    .trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

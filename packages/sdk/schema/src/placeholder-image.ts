// The picture a generated or starter page carries until a person chooses the real one. By default it is a seeded photo from picsum.photos, which needs
// a connection to the internet; `local` is a tiny flat grey picture (3:2, the shape of the generators' placeholders) kept in the code itself as a PNG
// data address, which the sanitiser accepts (raster `data:` images only) and which needs no host at all. Chosen by PLACEHOLDER_IMAGES (servers) and
// VITE_PLACEHOLDER_IMAGES (the editor, a build argument): the `private` profile sets `local`.

export type PlaceholderImages = 'picsum' | 'local'

/** 60x40 PNG, flat #d1d5db (117 bytes). */
export const LOCAL_PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAPElEQVR42u3OMQ0AAAgDsPl3x8GFGVRwkDSpgKZ63om0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPSlBYQ1errgKeXyAAAAAElFTkSuQmCC'

export const parsePlaceholderImages = (v: unknown): PlaceholderImages => (v === 'local' ? 'local' : 'picsum')

/** The placeholder for an element: `seed` is its id (the same element always gets the same photo), `width`/`height` the size asked of picsum. */
export function placeholderImageUrl(seed: string, mode: PlaceholderImages = 'picsum', width = 1200, height = 800): string {
  if (mode === 'local') return LOCAL_PLACEHOLDER_IMAGE
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`
}

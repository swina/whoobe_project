// Custom fonts in email (Settings > Custom fonts). Only the clients that load web fonts at all (Apple Mail, iOS Mail) will use them; the rest take the
// fallback stack of `fontFamilyStack`. The file has to be readable by the recipient's mail client, so the address is the same public one the images of an
// email get (`resolveImageRef`): without a public origin there is none, and the font is then asked of Google as before (it only exists there if the family
// has the same name as a Google family).
import { listCustomFonts } from '../db/custom-fonts-records.js';
import { resolveImageRef } from '../dam/resolve-content-image-refs.js';
import type { FontFace } from '@whoobe-cms/schema';

/** The faces of the custom fonts among `fonts` (the editor's names, `+` for spaces), each with a public address; none on any failure. */
export async function resolveMailFontFaces(fonts: readonly string[]): Promise<FontFace[]> {
  const wanted = new Set(fonts.map((f) => f.replaceAll('+', ' ').trim().toLowerCase()));
  if (!wanted.size) return [];
  try {
    const faces: FontFace[] = [];
    for (const f of await listCustomFonts()) {
      if (!wanted.has(f.family.trim().toLowerCase())) continue;
      const resolved = await resolveImageRef(f.assetPath);
      if (resolved) faces.push({ family: f.family, weight: f.weight, style: f.style, url: resolved.url });
    }
    return faces;
  } catch {
    return [];
  }
}

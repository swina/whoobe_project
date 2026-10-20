// The words of a generated site come through named slots: each text a block draws is asked for by a key (`p0.b2.title`, `header.button`) with its default,
// its label and its length. The defaults are the placeholder copy; a caller (the AI, later) can give other words for the same keys. Nothing else about the
// site can be changed that way: a slot is text, cut to its length, with no markup.

export interface Slot { key: string; label: string; max: number; default: string }

export class TextSource {
  readonly slots: Slot[] = [];
  constructor(private readonly overrides: Record<string, string> = {}) {}

  /** The text of a slot: the one that was given for the key, cleaned and cut, or the default. */
  t = (key: string, label: string, def: string, max: number): string => {
    this.slots.push({ key, label, max, default: def });
    const given = this.overrides[key];
    if (typeof given !== 'string') return def;
    const clean = given.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
    return clean || def;
  };
}

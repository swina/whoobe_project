// sharp's own default is 268 MP (16384 x 16384): a decompression-bomb image of that size costs ~800 MB while
// decoding. Cap what we accept, in pixels (override: ASSET_MAX_INPUT_PIXELS; 0 keeps the library default).
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;

export function maxInputPixels(env: NodeJS.ProcessEnv = process.env): number | false {
  const raw = env.ASSET_MAX_INPUT_PIXELS;
  if (raw === undefined || raw === '') return DEFAULT_MAX_INPUT_PIXELS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_INPUT_PIXELS;
  return n === 0 ? false : Math.floor(n);
}

/** `sharp(input, { limitInputPixels })` for anything that decodes user-supplied image data. `sharp` is the
 *  module, which this package loads lazily (it is an optional dependency), so it is passed in. */
export function sharpInput(sharp: any, input: unknown, options: Record<string, unknown> = {}): any {
  const limit = maxInputPixels();
  return sharp(input, limit === false ? options : { limitInputPixels: limit, ...options });
}

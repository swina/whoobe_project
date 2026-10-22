// Custom fonts: the pure parts live in @whoobe-cms/schema, because the site generators (`publish`, `mobile-app`) need the same `@font-face`
// writer and do not depend on core. Re-exported here for core-api, the editor and the dashboard.
export {
  FONT_STYLES, readCustomFontBody, fontFaceCss, guessFontFace,
  type FontStyle, type CustomFontInput, type CustomFontRead, type FontFace, type GuessedFace,
} from '@whoobe-cms/schema';

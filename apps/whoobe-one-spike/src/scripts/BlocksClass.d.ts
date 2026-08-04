// Hand-written type shim for the verbatim-ported BlocksClass.js - same
// rationale as ElementsClass.d.ts: TS infers `json.build.purgeCSS` etc. as
// literally `null` from the constructor's initial assignment, and
// `json.blocks` as `never[]` from its `[]` default, neither of which match
// real usage (`page.json.blocks = someElement`, a single root node despite
// the plural field name - a genuine inconsistency in the source itself,
// not introduced here; typed loosely as `any` rather than fought).
export interface BlockBuild {
  purgeCSS: string[] | null
  images: string[] | null
  fonts: string[] | null
  plugins: any
}

export interface BlockJson {
  build: BlockBuild
  blocks: any
}

export default class Block {
  // The source's own constructor initializes this to the number `0` as
  // its "no id yet" sentinel - kept as-is (still a valid falsy check,
  // `!editor.page.id`, wherever that matters). Once a template is actually
  // saved, this becomes the real Postgres UUID string the backend
  // assigned it (see database-actions.ts's savePage()) - not something
  // the source's own local-library model ever needed to represent, hence
  // the wider type here rather than in the constructor itself.
  id: number | string
  blocks_id: string
  name: string
  description: string
  category: string
  tags: string[]
  json: BlockJson
  html: string | null
  image: string
  enabled: boolean
  premium: boolean
  stars: number
  favorite: boolean
  // Not in the source's BlocksClass.js constructor at all - the source's
  // own "component library" model (name/category/tags/description/image/
  // premium/stars/favorite) has no URL-routing concept, since it's a
  // personal local library of reusable components, not a hosted CMS
  // document. `path` is assigned dynamically at first save instead (see
  // database-actions.ts's savePage()), same treatment as `linkTarget`/
  // `image.alt` in ElementsClass.d.ts - a genuinely new field, not a
  // change to the ported .js file itself.
  path?: string

  randomID(): string
  purge(): this
  purgeCSS(): this
  purgeImages(): this
  fonts(): this
}

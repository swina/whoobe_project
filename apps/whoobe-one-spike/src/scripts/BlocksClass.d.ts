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
  id: number
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

  randomID(): string
  purge(): this
  purgeCSS(): this
  purgeImages(): this
  fonts(): this
}

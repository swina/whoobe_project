import {
  TextCursorInput,
  AlignJustify,
  FileText,
  Hash,
  SquareCheck,
  Calendar,
  Mail,
  Globe,
  SquareChevronDown,
  ListChecks,
  Link2,
  Network,
  FolderOpen,
  Image,
  Video,
  Component,
  File,
  KeyRound,
  Languages,
  Boxes,
  CircleDot,
  Clock,
  FileCode,
} from '@lucide/vue'

// Shared list-column vocabulary between ObjectsView.vue (the listing) and
// MasterClassTab.vue's List Layout editor (the per-class default columns).
// Single source of truth for the system columns always available in a
// listing and for the per-field-type lucide icons (also reused by
// FieldListEditor.vue's list rows).
export interface ListColumnOption {
  name: string
  title: string
}

export const SYSTEM_LIST_COLUMNS: ListColumnOption[] = [
  { name: 'key', title: 'Key / Path' },
  { name: 'locales', title: 'Locales' },
  { name: 'class', title: 'Class' },
  { name: 'status', title: 'Status' },
  { name: 'updatedAt', title: 'Modification Date' },
]

// One lucide icon per field type (verified against the installed
// @lucide/vue export names), used in FieldListEditor.vue's list rows and
// in the List Layout editor's column rows.
const FIELD_TYPE_ICONS: Record<string, any> = {
  input: TextCursorInput,
  textarea: AlignJustify,
  wysiwyg: FileText,
  markdown: FileCode,
  numeric: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  email: Mail,
  country: Globe,
  select: SquareChevronDown,
  multiselect: ListChecks,
  manyToOneRelation: Link2,
  manyToManyRelation: Network,
  link: Link2,
  asset: FolderOpen,
  image: Image,
  video: Video,
  fieldcollections: Component,
}

export function fieldTypeIcon(fieldType: string): any {
  return FIELD_TYPE_ICONS[fieldType] ?? File
}

export const SYSTEM_LIST_COLUMN_ICONS: Record<string, any> = {
  key: KeyRound,
  locales: Languages,
  class: Boxes,
  status: CircleDot,
  updatedAt: Clock,
}

export function listColumnIcon(name: string, fieldType?: string): any {
  if (fieldType) return fieldTypeIcon(fieldType)
  return SYSTEM_LIST_COLUMN_ICONS[name] ?? File
}
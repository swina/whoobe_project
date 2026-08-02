import { Image, FileText, Film, FileArchive, Archive } from '@lucide/vue'

export function getIconForFileType(type: string) {
  switch (type) {
    case 'PNG':
    case 'JPG':
    case 'GIF':
    case 'SVG':
    case 'WEBP': return Image
    case 'PDF': return FileText
    case 'MP4': return Film
    case 'ZIP': return FileArchive
    default: return Archive
  }
}

export function getIconForFilename(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  if (ext === 'mp4') return Film
  if (ext === 'zip') return FileArchive
  return Archive
}

export const PREVIEWABLE_IMAGE_TYPES = ['PNG', 'JPG', 'GIF', 'SVG', 'WEBP']

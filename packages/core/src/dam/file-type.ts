export interface FileTypeInfo {
  fileType: string;
  mimeType: string;
}

/**
 * Shared by the browser (damStore.ts, for immediate UI display before a
 * round trip) and the backend (asset-processor, for the persisted asset
 * record) so the two never disagree on what a given filename's type is.
 */
export function getFileTypeFromFilename(filename: string): FileTypeInfo {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png': return { fileType: 'PNG', mimeType: 'image/png' };
    case 'jpg':
    case 'jpeg': return { fileType: 'JPG', mimeType: 'image/jpeg' };
    case 'gif': return { fileType: 'GIF', mimeType: 'image/gif' };
    case 'svg': return { fileType: 'SVG', mimeType: 'image/svg+xml' };
    case 'webp': return { fileType: 'WEBP', mimeType: 'image/webp' };
    case 'pdf': return { fileType: 'PDF', mimeType: 'application/pdf' };
    case 'zip': return { fileType: 'ZIP', mimeType: 'application/zip' };
    case 'mp4': return { fileType: 'MP4', mimeType: 'video/mp4' };
    case 'json': return { fileType: 'JSON', mimeType: 'application/json' };
    case 'md':
    case 'markdown': return { fileType: 'MD', mimeType: 'text/markdown' };
    case 'yml':
    case 'yaml': return { fileType: 'YAML', mimeType: 'application/yaml' };
    default: return { fileType: ext.toUpperCase() || 'FILE', mimeType: 'application/octet-stream' };
  }
}

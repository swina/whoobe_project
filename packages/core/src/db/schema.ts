/**
 * Database Layout: Hybrid EAV + JSONB
 * Placeholder schema for custom PIM / MDM data objects & asset metadata.
 */

export interface BaseDataObject {
  id: string;
  classId: string;
  key: string;
  path: string;
  parentId: string | null;
  published: boolean;
  creationDate: number;
  modificationDate: number;
  attributes: Record<string, unknown>; // JSONB flexible storage
}

export interface AssetMetadata {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  dimensions?: { width: number; height: number };
  metadata: Record<string, unknown>; // EXIF / IPTC metadata
}

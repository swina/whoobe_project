import { createS3ProviderFromEnv } from '../dam/s3-provider.js';
import { upsertAssetRecord } from '../db/asset-records.js';
import { randomBytes } from 'node:crypto';

export interface AiImageDamInput {
  url: string;
  folderPath: string;
  fileName: string;
  revisedPrompt?: string;
}

export interface AiImageDamOutput {
  damUrl: string;
  assetId: string;
}

export async function saveAiImageToDam(input: AiImageDamInput): Promise<AiImageDamOutput> {
  const { url, folderPath, fileName, revisedPrompt } = input;

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/').pop() || 'png';
  const uniqueName = `${fileName.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${randomBytes(3).toString('hex')}`;
  const pimcorePath = `${folderPath.replace(/\/+$/, '')}/${uniqueName}.${ext}`;

  const provider = createS3ProviderFromEnv();
  const { s3Key, url: s3Url } = await provider.uploadAsset(pimcorePath, buffer, contentType, {
    isPublic: true,
    metadata: revisedPrompt ? { aiPrompt: revisedPrompt } : undefined,
  });

  const record = await upsertAssetRecord({
    pimcorePath,
    filename: `${uniqueName}.${ext}`,
    folderPath,
    sizeBytes: buffer.length,
    mimeType: contentType,
    fileType: 'image',
    s3Key,
    isPublic: true,
    metadata: revisedPrompt ? {
      technical: { mimeType: contentType, sizeBytes: buffer.length, format: ext },
      raw: { ai_generated: true, ai_prompt: revisedPrompt },
    } : null,
  });

  return { damUrl: s3Url, assetId: record.id };
}
# Implementation Plan - DAM Phase 1: S3 Storage Strategy & Folder Visibility

Implementation plan for Phase 1 of Digital Asset Management (DAM) based on [WhoobeCMS-AssetsManagements.md](file:///y:/data/development/personal/pimcore-to-custom/docs/WhoobeCMS-AssetsManagements.md).

## Overview
Phase 1 establishes the S3-compatible object storage provider (MinIO / AWS S3) mapping physical asset paths (e.g., `/logos/brand-logo.png`) directly to root bucket keys (`logos/brand-logo.png`) by default.
By default, the assets root folder and sub-folders are **private**. A flexible folder visibility strategy will allow designating specific folders/paths as **public** while serving private assets via short-lived pre-signed URLs.

---

## User Review Required

> [!IMPORTANT]
> - **S3 SDK Dependency**: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` will be added to `/packages/core`.
> - **Default Privacy**: Assets are private by default. Access to private assets will use signed URLs (`getSignedUrl`), while public folder assets return direct bucket/CDN URLs.
> - **Folder Visibility Engine**: A folder visibility rule registry will handle path checking (e.g. `/public/*` or explicitly registered public folder paths).

---

## Proposed Changes

### Core Package (`/packages/core`)

#### [MODIFY] [storage.ts](file:///y:/data/development/personal/pimcore-to-custom/packages/core/src/dam/storage.ts)
- Extend `AssetStorageProvider` interface to support:
  - `uploadAsset(pimcorePath: string, buffer: Buffer, mimeType: string, isPublic?: boolean)`
  - `getAssetUrl(pimcorePath: string, options?: { expiresIn?: number })`
  - `deleteAsset(pimcorePath: string)`
  - `isPathPublic(pimcorePath: string): boolean`
  - `setFolderVisibility(folderPath: string, isPublic: boolean)`

#### [NEW] [s3-provider.ts](file:///y:/data/development/personal/pimcore-to-custom/packages/core/src/dam/s3-provider.ts)
- Create `S3AssetStorageProvider` implementing `AssetStorageProvider` using `@aws-sdk/client-s3`.
- Configure bucket, region, endpoint (for MinIO compatibility), and public/private ACL rules.
- Implement pre-signed URL generation for private files using `@aws-sdk/s3-request-presigner`.

#### [NEW] [visibility-manager.ts](file:///y:/data/development/personal/pimcore-to-custom/packages/core/src/dam/visibility-manager.ts)
- Create `FolderVisibilityManager` to manage public vs private folder path prefix rules.
- Support wildcard path matching (e.g., `/public/**`, `/uploads/marketing/**`).

#### [MODIFY] [index.ts](file:///y:/data/development/personal/pimcore-to-custom/packages/core/src/index.ts)
- Export DAM storage provider, S3 adapter, and folder visibility manager.

#### [NEW] [storage.test.ts](file:///y:/data/development/personal/pimcore-to-custom/packages/core/src/dam/storage.test.ts)
- Unit tests verifying:
  - Path normalization and S3 key formatting.
  - Public vs private path matching.
  - Presigned vs direct URL generation logic.

---

## Verification Plan

### Automated Tests
- Run unit tests in `/packages/core`:
  ```bash
  cmd /c npm test --prefix packages/core
  ```

### Manual Verification
- Verify S3 path mapping function converts `/logos/brand-logo.png` to root bucket key `logos/brand-logo.png`.
- Test public folder registration and URL generation for public vs private asset paths.

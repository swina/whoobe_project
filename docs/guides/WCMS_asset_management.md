# Whoobe CMS - Asset Management Guide (DAM)

## 1. Executive Summary

Whoobe CMS includes a high-performance Digital Asset Management (DAM) system built as a modern, decoupled replacement for legacy Pimcore asset structures. It provides complete S3/MinIO cloud and self-hosted storage integration, fine-grained public/private folder security policies, client-side WebP thumbnail generation, interactive sidebar folder trees, multi-column search/filtering, column sorting, pagination, and bulk operations (ZIP download and deletion).

---

## 2. Architecture & Storage Strategy

### 2.1 Decoupled S3 / MinIO Storage Provider
The DAM layer maps virtual asset paths (e.g. `/logos/hero_banner.png` or `/documents/q3_report.pdf`) directly to object keys in a target S3 bucket or MinIO bucket container (e.g. `whoobe-cms`).

- **Root Bucket Mapping**: By default, asset keys are formatted directly under the root bucket level (e.g. `logos/hero_banner.png`). Custom key prefixes (e.g. `media/`) are also supported.
- **Thumbnail Namespace**: Generated WebP thumbnails are automatically saved under `.thumbnails/` (e.g. `.thumbnails/logos/hero_banner_thumb.webp`).

### 2.2 Public vs. Private Folder Security Strategy
- **PUBLIC Assets**: Files located in public folders (e.g., `/public/**`, `/uploads/marketing/**`, or folders marked `PUBLIC`) are served via direct HTTP/CDN URLs (`http://localhost:9000/whoobe-cms/logos/hero_banner.png`). MinIO bucket policies automatically grant anonymous `s3:GetObject` ONLY on designated public prefixes.
- **PRIVATE Assets**: Files in private folders (or marked `PRIVATE`) require AWS SigV4 signed presigned URLs with an expiration time (`?X-Amz-Signature=...`). Unauthenticated direct requests return `403 AccessDenied` from MinIO.

---

## 3. Managing S3 / MinIO Configuration

DAM settings can be managed directly from the **Admin Dashboard** under **S3/MinIO Configuration**:

| Setting | Default Value | Description |
| :--- | :--- | :--- |
| **Target Bucket** | `whoobe-cms` | The S3 / MinIO bucket container name. |
| **Endpoint URL** | `http://localhost:9000` | MinIO or S3 endpoint URL. |
| **Region** | `us-east-1` | AWS S3 region identifier. |
| **Access Key ID** | `minioadmin` | Access credential for S3 API calls. |
| **Secret Access Key** | `minioadminpassword` | Secret credential for AWS SigV4 signatures. |
| **Public Base URL** | *(Optional)* | CDN or custom domain endpoint (e.g., `https://cdn.whoobe.com`). |
| **Force Path Style** | `true` | Enabled for path-style MinIO compatibility (`http://endpoint/bucket/key`). |

### 3.1 Test & Sync Storage Connection
Clicking **`Test & Sync MinIO Storage`** in the dashboard validates the connection, configures selective public bucket policies, and automatically syncs/uploads missing binary objects for any asset listed in state.

---

## 4. Left Navigation Sidebar Folder Tree

The left navigation sidebar pane integrates an interactive, collapsible directory tree directly beneath the **Assets** menu item:

- **Root & Subfolder Hierarchy**: Displays `/ (Root)` and all subfolders (`/logos`, `/documents`, `/videos`, etc.).
- **Expand/Collapse Chevron**: Toggles individual subtrees or the entire Assets directory tree.
- **Visibility Indicators**:
  - 🟢 **Green Dot**: `PUBLIC` folder (Direct CDN Access).
  - 🟡 **Amber Dot**: `PRIVATE` folder (Signed Access Only).
- **Instant Folder Selection**: Clicking any folder in the left sidebar tree sets the active folder view and navigates directly to `/assets`.

---

## 5. Folder Management & Visibility Rules

### 5.1 Creating Folders
1. Click **`New Folder`** in the Assets Manager header.
2. Enter the folder name (e.g. `marketing`).
3. Select Visibility:
   - **`PUBLIC (CDN)`**: Accessible anonymously via direct URLs.
   - **`PRIVATE (Signed)`**: Restricted to signed presigned URLs.
4. Click **`Create Folder`**. The folder rules automatically register `${path}/**` visibility policies.

### 5.2 Deleting Folders
Deleting a folder purges the folder and all nested assets/subfolders. If the user is currently viewing the deleted folder, the DAM automatically navigates back to the parent folder path.

---

## 6. Asset Upload, ZIP Extraction & Versioning

### 6.1 Uploading Assets
- **Single / Multiple Uploads**: Click **`Upload Assets`** or drag & drop files into the upload modal.
- **ZIP Auto-Extraction**: Uploading a `.zip` archive displays an **"Auto-extract ZIP archive into new folder"** checkbox option. When checked, the ZIP contents are automatically unpacked into a dedicated folder.

### 6.2 Asset Versioning
Each asset maintains a version counter (`v1`, `v2`, `v3`...):
1. Click the **`Upload New Version`** (Refresh) button on any asset card/row.
2. Select the replacement file and click **`Upload New Version`**.
3. The asset's version increments, metadata updates, and physical storage binary is replaced.

---

## 7. Client-Side WebP Thumbnail Generation

Thumbnail generation adapts automatically based on runtime environment:

- **Browser Runtime**: Uses HTML5 `createImageBitmap` + `<canvas>` + `canvas.toBlob('image/webp', 0.8)` to produce WebP thumbnail variants (`thumb: 150x150`, `medium: 400x400`, `large: 1024x1024`) client-side.
- **Node.js Runtime**: Uses C++ native `sharp` bindings when running on server-side environments.

---

## 8. View Modes, Filtering, Sorting & Pagination

### 8.1 Grid & List View Toggle
Switch between visual **Grid Cards** view and structured **List Table** view via the toolbar toggle. Preference persists in `localStorage`.

### 8.2 Configurable Columns Menu
In List View, click **`Columns`** to toggle visibility for 11 metadata fields:
1. Preview Thumbnail
2. Filename
3. Asset Path
4. File Type
5. Size
6. Visibility (`PUBLIC` / `PRIVATE`)
7. Version
8. Uploaded Date
9. Updated Date
10. S3 Object Key
11. Action Buttons

### 8.3 Multi-Column Search & Filters
- **Text Search**: Real-time filtering across filename, asset path, file type, and S3 key.
- **Type Filter**: Dropdown filter for `IMAGE`, `VIDEO`, `DOCUMENT`, `ARCHIVE`, or `ALL`.
- **Visibility Filter**: Dropdown filter for `PUBLIC`, `PRIVATE`, or `ALL`.
- **Clickable Header Sorting**: Click table column headers to toggle ascending (`▲`) or descending (`▼`) sorting.

### 8.4 Flexible Pagination
- **Predefined Limits**: Select `10`, `25`, `50`, `100`, `200`, `All`, or input a **Custom** numeric page limit.
- **Navigation Controls**: First (`«`), Previous (`‹`), Page Numbers, Next (`›`), Last (`»`).

---

## 9. Paginated Selection & Bulk Actions

### 9.1 Select All Page & Folder Selection
- **Header Checkbox**: Click the select-all checkbox in the List View table header (`<thead>`) or click grid checkboxes to select items on the active page.
- **Folder Selection**: Click **"Select all X assets in folder"** in the selection toolbar to select all filtered items across all pages.

### 9.2 Bulk Delete
Click **`Delete Selected`** to remove all selected assets from DAM storage with a single confirmation modal.

### 9.3 Bulk Download (Direct / ZIP Archive)
- **Single Asset Selected**: Triggers a direct file download link.
- **Multiple Assets Selected**: Packages all selected files into a downloadable ZIP archive (`dam_assets_<timestamp>.zip`) using JSZip.

---

## 10. Troubleshooting & Docker MinIO Setup

### 10.1 Docker MinIO Setup
When running MinIO in Docker (`pimcore_custom_minio`):

```bash
# 1. Alias MinIO container connection
docker exec pimcore_custom_minio mc alias set local http://localhost:9000 minioadmin minioadminpassword

# 2. Ensure bucket exists
docker exec pimcore_custom_minio mc mb --ignore-existing local/whoobe-cms

# 3. Enable CORS for cross-origin browser requests
docker exec pimcore_custom_minio mc admin config set local api cors_allow_origin="*"
```

### 10.2 Common Errors & Fixes

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `AccessDenied` | Missing bucket policy for public objects | Click **`Test & Sync MinIO Storage`** in dashboard or check public folder rules. |
| `NoSuchKey` | Object key listed in state but missing from MinIO disk | Click **`Test & Sync MinIO Storage`** to upload missing binary keys. |
| `TypeError: Failed to fetch` | MinIO CORS origin not enabled | Execute `mc admin config set local api cors_allow_origin="*"`. |
| `QuotaExceededError` | Base64 `dataUrl` stored in `localStorage` | Fixed automatically in `damStore` by stripping `dataUrl` before persisting. |

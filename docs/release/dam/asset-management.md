# Whoobe - Asset Management Guide (DAM)

## 1. Executive Summary

Whoobe includes a high-performance Digital Asset Management (DAM) system built as a modern, decoupled replacement for legacy Pimcore asset structures. It provides S3-compatible storage integration (Garage by default for local and LAN installs, any cloud or enterprise S3 by configuration), fine-grained public/private folder security policies, client-side WebP thumbnail generation, interactive sidebar folder trees, multi-column search/filtering, column sorting, pagination, and bulk operations (ZIP download and deletion).

---

## 2. Architecture & Storage Strategy

### 2.1 Decoupled S3-compatible storage
The DAM layer maps virtual asset paths (e.g. `/logos/hero_banner.png` or `/documents/q3_report.pdf`) to object keys in an S3-compatible bucket. The store is chosen by deployment configuration, not in the dashboard:

- **Garage** (the default for local and LAN installs) runs inside the Compose project and creates its own bucket and access key on first start.
- **An external S3** (AWS S3, OCI, an enterprise S3 service) is a configuration change; see `docs/release/operations/storage-backends.md` and the "Using an external S3" section of the workspace guide.
- **MinIO** is no longer part of the stack (removed in 0.1.0, F-048/F-050); an existing one can still be used as an external S3 endpoint.

- **Root Bucket Mapping**: By default, asset keys are formatted directly under the root bucket level (e.g. `logos/hero_banner.png`). A key prefix (e.g. `media/`) is set with `S3_KEY_PREFIX`.
- **Thumbnail Namespace**: Generated WebP thumbnails are saved under `.thumbnails/` (e.g. `.thumbnails/logos/hero_banner_thumb.webp`).

### 2.2 Public vs. Private Assets
The browser never talks to the S3 store. Every asset is served by the asset-processor at `/dam-asset/...`, which decides who may read it:

- **PUBLIC assets**: an asset whose folder matches a public rule is served to anyone. The rule `/public/**` (the `/public` folder and all its sub-folders) is built in; more rules can be added in the DAM settings. Everything that public pages and published sites use must live under a public rule, otherwise visitors get `404`.
- **PRIVATE assets** (the default for anything else): the request needs a logged-in session; anonymous requests answer `404`, so the existence of the file is not revealed. The system `private/` area always needs a session.
- Server-to-server readers (for example the system-log download) authenticate with the `DAM_SERVICE_TOKEN`.
- Setting `DAM_ENFORCE_ASSET_VISIBILITY=false` restores the old behaviour in which anyone with the URL can read; it is on by default and should stay on.
- Files whose type a browser would execute (HTML, SVG, XML, JavaScript) are served as downloads with a restrictive Content-Security-Policy, so an uploaded file cannot run script on the application's origin.

---

## 3. Storage Configuration

The DAM screen (**Settings > DAM Configuration**, titled "DAM Storage & S3 Configuration") does not hold credentials: bucket, endpoint and keys are read by the asset-processor from its server-side environment. The screen shows them read-only:

| Shown (server-configured) | Environment variable | Description |
| :--- | :--- | :--- |
| **S3 Bucket** | `S3_BUCKET` | The bucket name (a workspace gets `whoobe-cms-<slug>`). |
| **S3 Endpoint** | `S3_ENDPOINT` | The store's endpoint. |
| **Key Prefix** | `S3_KEY_PREFIX` | Optional prefix for every key; empty means root-bucket storage. |
| **Public Base URL / CDN** | `S3_PUBLIC_BASE_URL` | Optional CDN or custom domain in front of public assets. |

Also in the environment, not shown on the screen: `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (`true` for most self-hosted stores, `false` for AWS). The one editable field is the **DAM Asset Processor API URL** the dashboard talks to. Changing any of the environment values means recreating the asset-processor container.

### 3.1 Test & Sync Storage Connection
**`Test & Sync S3 Storage`** (it works with any S3-compatible store) asks the asset-processor for its storage information, makes sure the bucket exists and applies the folder visibility rules where the store supports bucket policies (Garage does not, and does not need them: visibility is enforced by the asset-processor), then reloads the folder tree and the asset list. The result is shown in the status bar.

---

## 4. Left Navigation Sidebar Folder Tree

The left navigation sidebar pane integrates an interactive, collapsible directory tree directly beneath the **Assets** menu item:

- **Root & Subfolder Hierarchy**: Displays `/ (Root)` and all subfolders (`/logos`, `/documents`, `/videos`, etc.).
- **Expand/Collapse Chevron**: Toggles individual subtrees or the entire Assets directory tree.
- **Visibility Indicators**:
  - 🟢 **Green Dot**: `PUBLIC` folder (served to anyone).
  - 🟡 **Amber Dot**: `PRIVATE` folder (needs a logged-in session).
- **Instant Folder Selection**: Clicking any folder in the left sidebar tree sets the active folder view and navigates directly to `/assets`.

---

## 5. Folder Management & Visibility Rules

### 5.1 Creating Folders
1. Click **`New Folder`** in the Assets Manager header.
2. Enter the folder name (e.g. `marketing`).
3. Select Visibility:
   - **`PUBLIC (CDN)`**: Accessible anonymously through `/dam-asset/...` (and the CDN base URL, if one is configured).
   - **`PRIVATE (Signed)`**: Restricted to logged-in users.
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

## 10. Troubleshooting

The browser never connects to the S3 store (only to the asset-processor), so there is no CORS setup to do on the store.

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| An image shows in the admin but a public page or a visitor gets `404` | The asset is private: it is not under a public folder rule (`/public/**` is built in) | Move it under `/public` (or add a public rule in the DAM settings) |
| A private asset is readable without logging in | `DAM_ENFORCE_ASSET_VISIBILITY=false` is set, or the asset-processor image is older than 2026-10-04 (it used to default to off) | Remove the flag; rebuild and recreate the asset-processor |
| `Test & Sync` reports "Connection failed" | The asset-processor is down or the **DAM Asset Processor API URL** is wrong | Check the container and the URL on the DAM screen |
| Uploads fail or the screen shows `-` for bucket and endpoint | The store is not reachable with the credentials in the environment | Check `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; with Garage, check that the `garage` container is healthy |
| The garage container exits with "S3_ACCESS_KEY_ID must be 'GK' followed by 24 hex characters" | Credentials in another format (typically a workspace created before the Garage default) | See the workspace guide, "Workspaces created before the Garage default" |
| `NoSuchKey` for an asset that is listed | The record exists but the object is missing in the bucket (a store replaced without copying the data) | Copy the data to the new bucket first (`rclone sync` / `aws s3 sync`), see `storage-backends.md` |

Details on storage backends, switching stores and external S3: `docs/release/operations/storage-backends.md`.

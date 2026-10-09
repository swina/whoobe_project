# File uploads in forms

A form can ask the visitor for a file (a CV, a document, a photo). The file is checked, stored privately in the asset library,
and referenced by the submission.

## 1. Switch it on for the website

**Dashboard > Settings > Form uploads**: pick the website and set

- **Allow file uploads**: off by default.
- **Allowed file types**: only types whose content Whoobe can verify are offered (PDF, images, Office and OpenDocument files, zip, audio, video, plain text and CSV). Web pages, SVG, scripts and programs can never be allowed.
- **Largest file** (up to 25 MB), **files per submission** (up to 10), **daily total** (all forms of the website, up to 1 GB).
- **Default target folder**: where the files go in the asset library; `private/forms` by default. A folder outside `private/` is refused unless **Allow a public folder** is on (then anyone with the link can read the files: not for CVs or anything personal).

## 2. Add the field to the form

In the editor, **Elements > form > File Upload**, dropped inside the form. In **Advanced**:

- **Attributes > name**: the name of the data class field that will hold the file.
- **File upload** section: accept only some of the website's types, how many files (more than one lets the visitor choose several), and a folder just for this field. A field can only ask for **less** than the website allows.

The data class field that receives the file must be able to hold it:

| Field type of the class | Holds |
|---|---|
| relation without target, `asset`, `image` | one file (`{ assetId }`) |
| `array` | several files (a list of asset ids) |
| `json` | several files (a list of `{ assetId }`) |

The form must write to a **data class** (a form that sends to a gateway endpoint does not take files yet).

## 3. What the visitor and the server do

1. The visitor chooses the file; when the form is sent the page first asks the server to approve it (type, size, daily quota), then sends the bytes. A refusal shows the reason (for example "Allowed file types: pdf, png") and nothing is submitted.
2. The server checks the first bytes of the file against its type (the name and the browser's type do not count), cuts anything larger than allowed, and decodes and rewrites pictures (metadata and anything hidden after the picture are dropped).
3. Only when the form is submitted does the file become an asset: **private**, under a generated name (the visitor's file name is kept only as a note), in the target folder. Files that are never submitted are deleted after two hours.

Administrators read the files in the **Assets** library (private folder); visitors cannot.

## Installation notes

- Needs `UPLOAD_TOKEN_SECRET` (any random string of 32+ characters, `openssl rand -hex 32`); `provision-workspace.sh` generates it. Without it uploads answer 503.
- The reverse proxy must send `/public/upload-data/` to the asset service: the nginx template does; an existing workspace needs `scripts/render-workspace-nginx.sh <slug>`. Behind no proxy (development) set `UPLOAD_PUBLIC_BASE_URL` to the asset service address (`http://localhost:3002`).
- Limits per address and minute: `UPLOAD_INTENT_RATE_LIMIT_PER_MINUTE` (20), `UPLOAD_PUT_RATE_LIMIT_PER_MINUTE` (30).

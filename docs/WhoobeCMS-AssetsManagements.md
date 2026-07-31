# DIGITAL ASSETS MANAGEMENTS (DAM)

## Phase 1 : Storage Strategy: 
S3-compatible object storage (MinIO / AWS S3). Physical asset paths from Pimcore (e.g., /logos/brand-logo.png) map directly to S3 prefix keys (s3://bucket/logos/brand-logo.png). The assets root folder by default is not public. Consider to create a system where some folder can become public

## Phase 2 : Processing Pipeline 
Sharp for high-speed Node.js image manipulation, resizing, and WebP conversion.

## Phase 3 : Metadata Extraction 
exiftool-vendor for deep EXIF/IPTC metadata extraction.

## Phase 4 : Microservice Isolation 
Asset processing runs as an isolated Node.js microservice/worker to prevent blocking core product API calls.
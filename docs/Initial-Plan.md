# Technical Plan & Architecture: TypeScript Enterprise Pimcore Alternative & Migration Engine

## 1. Overview & Vision
This document defines the architectural blueprint, technology stack, and migration strategy for building a **TypeScript-native, modular enterprise alternative to Pimcore** with a seamless, loss-less migration path from legacy Pimcore PHP instances.

Pimcore consolidates Product Information Management (PIM), Master Data Management (MDM), Digital Asset Management (DAM), and Content Management System (CMS) in a PHP monolith. This project replaces that architecture with a high-performance, modular system featuring **Whoobe Studio** as its core visual block builder.

---

## 2. Architectural Blueprint

```
                     ┌──────────────────────────────────┐
                     │       TypeScript GraphQL API     │
                     └────────────────┬─────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  PIM / MDM Core  │         │     DAM Engine   │         │ Headless CMS &   │
│  (Data Modeling) │         │  (Asset Pipeline)│         │ Whoobe Studio    │
└────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ PostgreSQL /     │         │   S3 / MinIO     │         │ Vue.js Visual    │
│ Drizzle ORM      │         │ (Sharp + Exif)   │         │ Builder Bridge   │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

### Monorepo Structure (Turborepo)
To ensure reusability across enterprise business units, the platform is structured as a monorepo:
- **`/packages/core`**: Database schemas, Drizzle ORM migrations, core authentication, and dynamic validation logic.
- **`/packages/migration-tool`**: Dedicated ETL (Extract-Transform-Load) CLI engine specialized in migrating data, documents, and assets out of Pimcore.
- **`/apps/admin-dashboard`**: Next.js / Vite administrative UI utilizing Shadcn/ui & React Hook Form, generated dynamically from JSON `fields_configuration`.
- **`/apps/whoobe-studio`**: Visual block/WYSIWYG page builder engine based on [Whoobe Studio](https://github.com/swina/whoobe-studio-alpha-0122) (Vue.js), integrated as an embedded visual editor.

---

## 3. Technology Stack & Core Modules

### 3.1. Core Tech Stack
| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Database & ORM** | PostgreSQL + Drizzle ORM | PostgreSQL handles relational MDM/PIM requirements; JSONB columns handle dynamic Pimcore-style object attributes (Hybrid EAV + JSONB layout). |
| **Backend Framework**| NestJS or Fastify | Provides an enterprise-ready, modular architecture mirroring Pimcore's bundle system. |
| **API Layer** | GraphQL (Mercurius / Apollo) | Efficient fetching for deeply nested product relations and catalog structures. |
| **Visual CMS Builder**| Whoobe Studio (Vue.js) | Visual block-driven WYSIWYG editor producing structured JSON layout trees. |
| **Schema Validation**| Zod / TypeBox | Compiles runtime validators dynamically from stored class definition JSON schemas. |

### 3.2. Core Modules

#### 1. PIM / MDM Core (Dynamic Data Modeling)
- **Dynamic Schema Engine**: Store Pimcore Class Definitions as JSON schemas in the database. Compile them into runtime validators via Zod or TypeBox without requiring code redeployments.
- **Data Layout**: Hybrid EAV (Entity-Attribute-Value) + JSONB in PostgreSQL.
- **Localization (i18n)**: Database-level locale fallbacks (e.g. `{ en: "Shoes", it: null }` falls back automatically to `en`).
- **Workflow State Machine**: Complex product approval workflows powered by **XState**.

#### 2. DAM Engine (Digital Asset Management)
- **Storage Strategy**: S3-compatible object storage (MinIO / AWS S3). Physical asset paths from Pimcore (e.g., `/logos/brand-logo.png`) map directly to S3 prefix keys (`s3://bucket/logos/brand-logo.png`).
- **Processing Pipeline**: **Sharp** for high-speed Node.js image manipulation, resizing, and WebP conversion.
- **Metadata Extraction**: **`exiftool-vendor`** for deep EXIF/IPTC metadata extraction.
- **Microservice Isolation**: Asset processing runs as an isolated Node.js microservice/worker to prevent blocking core product API calls.

#### 3. Headless CMS & Whoobe Studio Integration
- **Visual Builder Integration**: Incorporates [Whoobe Studio](https://github.com/swina/whoobe-studio-alpha-0122) as the visual WYSIWYG page builder.
- **Vue.js $\leftrightarrow$ TypeScript Backend Bridge**:
  - **JSON Layout Contract**: Whoobe Studio outputs standardized block layout JSON schemas, validated by `/packages/core` using Zod/TypeBox.
  - **Embedding Mechanism**: Integrated into `/apps/admin-dashboard` via `iframe` postMessage API bridge or Custom Web Component wrapper.
- **Page Layout Trees**: Pages are stored as structured JSON trees representing visual component blocks, rendered seamlessly by target frontend apps (Next.js / Nuxt).

---

## 4. Enterprise Migration Pipeline (ETL)

To migrate seamlessly from legacy Pimcore without data loss, the project includes an ETL pipeline inside `/packages/migration-tool`.

```
┌──────────────────────────────┐     TypeScript Migration Script    ┌──────────────────────────────┐
│  Pimcore DB (MySQL)          │ ──► [1. Fetch Data & Documents] ──► │  New Enterprise Tool         │
│  & /web/var/assets           │ ──► [2. Parse & Validate Zod]   ──► │   (PostgreSQL + S3 +         │
│  & Pimcore Document Editables│ ──► [3. Translate to Whoobe JSON]─► │    Whoobe Block Layouts)     │
└──────────────────────────────┘ ──► [4. Bulk Insert via Drizzle]─► └──────────────────────────────┘
```

### Migration Pipeline Steps
1. **Step 1: Schema & Editable Translation**: Parse Pimcore Class Definition JSON files and translate layout components to `fields_configuration`. Translate Pimcore Document editables (areablocks, snippets) to Whoobe Studio JSON block schemas.
2. **Step 2: Data Extraction**: Stream objects and documents out of Pimcore using DataHub (GraphQL), Pimcore REST API, or direct read-only MySQL queries. Parse and validate types on-the-fly using Zod schemas.
3. **Step 3: Asset Migration**: Copy `/web/var/assets` to S3/MinIO retaining exact path prefixes, parsing metadata into PostgreSQL via `exiftool-vendor`.
4. **Step 4: Bulk Insertion**: Perform transactional bulk inserts using Drizzle ORM into PostgreSQL.

---

## 5. Phased Implementation Roadmap

- [ ] **Phase 1: Repository & Core Schema Setup**
  - Setup Turborepo with `/packages/core`, `/packages/migration-tool`, `/apps/admin-dashboard`, `/apps/whoobe-studio`.
  - Implement PostgreSQL + Drizzle ORM base schema (Hybrid EAV + JSONB).
- [ ] **Phase 2: Dynamic Schema & PIM Module**
  - Implement JSON Schema parser & Zod runtime compiler.
  - Implement i18n localization fallback engine and XState product approval workflows.
- [ ] **Phase 3: Whoobe Studio Integration & DAM Module**
  - Setup Vue.js Whoobe Studio bridge (`iframe` / postMessage protocol & JSON layout contract).
  - Build S3 asset storage wrapper & Sharp image processing service.
  - Integrate `exiftool-vendor` for asset metadata parsing.
- [ ] **Phase 4: Pimcore Migration Engine (`/packages/migration-tool`)**
  - Build Pimcore Class Definition & Document Editable parser script.
  - Build streaming MySQL/REST data extractor and S3 asset uploader.
- [ ] **Phase 5: E2E Validation & Benchmarking**
  - Perform bulk migration test on reference Pimcore dataset.
  - Verify data integrity, asset path mappings, Whoobe block layout rendering, and API query performance.

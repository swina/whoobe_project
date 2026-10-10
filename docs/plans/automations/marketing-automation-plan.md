# Whoobe Marketing Automation — Implementation Plan
*Document Version: 1.0.0 (Headless & Federated Architecture)*
*Date: October 2026*

---

## 1. Executive Summary & Vision

Traditional Headless CMS platforms are structurally static: they serve the exact same Zod-validated JSON layout trees to every visitor, forcing enterprises to purchase expensive, heavy, and privacy-invasive third-party personalization suites (e.g., Optimizely, Adobe Target). Conversely, traditional marketing suites introduce deep vendor lock-in and insecure client-side integration patterns that leak private corporate API keys.

**Whoobe Marketing Automation** disrupts this landscape by turning the platform into an **Omni-channel Headless Experience Orchestrator**. Leveraging Whoobe's core foundational blocks—the **Full-CRUD Federated API Gateway with Auto-Schema Detection** and runtime **PostgreSQL 16 JSONB modeling**—this engine enables real-time content personalization and automated lead-trapping workflows executed strictly server-side. 

Whoobe delivers high-velocity marketing agility while fully maintaining infrastructure performance, application type safety, and zero-trust cryptographic security.

---

## 2. Platform Goals & Boundaries

To prevent technical debt and protect the lightweight footprint of the TypeScript monorepo, the implementation plan enforces an absolute separation of concerns. Whoobe acts as the **orchestration middleware**, delegating massive compute tasks (such as email delivery or behavioral tracking logs) to verified external enterprise providers via secure proxies.

### 🟢 Core Implementation Goals
*   **Server-Side Content Personalization:** Enable content editors to define conditional block variations inside the visual canvas based on client segments. The `core-api` intercepts SDK payload reads and purges or swaps layout nodes at the server level before sending the compiled JSON tree to the client—eliminating client-side layout shifts (CLS) and protecting SEO scores.
*   **Form-Triggered Automated Workflows:** Utilize the existing **Visual Form Mapping UI** to execute complex multi-system mutations on form submit. (e.g., A public form submission triggers an encrypted `POST` to HubSpot ➔ if the vendor responds that the user is a *Marketing Qualified Lead (MQL)* ➔ the gateway automatically mutates the client context, unlocking protected DAM assets or private Documentation areas instantly).
*   **Visual Automation Canvas via XState:** Transform the native **Isometric Canvas Element** inside the builder (`whoobe-one-spike`) into a visual node-based workflow editor. Diagrams map directly onto the platform's core **XState** state-machines, allowing non-technical marketers to draw logic flows (e.g., `Form Submit ➔ Trigger Brevo Campaign Preset ➔ Alter Web Component States`) that execute deterministically on the server.

### 🔴 Definite Project Limitations (Out of Scope)
*   **No Native Big-Data Analytics:** Whoobe **will not** store clickstream, scroll, or granular behavioral logging tables inside PostgreSQL. Storing high-concurrency event streams locally degrades primary transactional performance. Tracking is delegated to specialized edge services (PostHog, Google Analytics, or HubSpot pixels), while Whoobe reads only the *aggregated segmentation tokens* to alter layout responses.
*   **No Native Email/SMS Delivery Infrastructure:** The platform **will not** implement internal delivery workers, SMTP routing clusters, or SMS queues. Mail operations are managed 100% via the secure proxy layer of the Federated API Gateway using declarative schemas (e.g., `apps/gateway/presets/brevo.json`).
*   **Incremental Static Regeneration (ISR) Cache Compliance:** Dynamic server-side personalization cannot intercept pages cached statically at the CDN edge (Cloudflare/Vercel). For highly personalized content domains, the Headless SDK will leverage a hybrid model—utilizing an **Edge Middleware** lookup rule to hydrate and swap localized JSON block descriptors client-side at runtime.

---

## 3. Runtime Services Framework

The marketing automation system maps directly onto the current decoupled Docker architecture, introducing **two logical extensions** and **one lightweight background worker**:



[Client SDK Request] ➔ [Edge Middleware / Cookie Check] ➔ [core-api Personalization Middleware] ➔ [JSON Tree Purge]
[Form Submit Action] ➔ [gateway Contextual Proxy] ➔ [External Vendor REST API] ➔ [XState Worker Automation]

### A. `gateway/contextual-proxy` (Extension on Port 3001)
An intelligent extension of the Full-CRUD Gateway. It intercepts public form actions, routes the encrypted payloads securely to third-party endpoints, evaluates the vendor's real-time JSON response, and applies immediate contextual authorization tokens if the lead status satisfies predefined business criteria.

### B. `core-api/personalization-middleware` (Extension on Port 3003)
An isolated middleware layer that intercepts public layout reads from the Headless SDK adapters. It decodes segmentation cookies or incoming edge routing tokens, processes the master Zod layout tree against active segment rules, and dynamically discards unauthorized conditional nodes before transmission.

### C. `automation-orchestrator` (New Background Worker Service)
A highly concurrent, event-driven background process driven by XState. It listens for internal platform events (e.g., `Form_Submitted`, `Asset_Downloaded`), tracks active multi-system state machines, and executes cascading programmatic commands across the API Gateway proxy without ever blocking core database read/write lifecycles.

---

## 4. Generated Artifacts Matrix

The marketing automation compilation cycle produces **three distinct physical assets** designed for seamless portability and security:

### I. Campaign & Configuration Assets (`/connectors/` & DAM)
*   **`brevo-campaign-draft.html`:** An automated visual compiler output. When a marketer clicks *"Send as Brevo campaign"* inside the Snippet panel, the engine converts the chosen visual node tree into an ultra-optimized, sterile email HTML file (with forced inline utility styles and client-safe structural tables), injecting it directly as a campaign draft into the remote marketing platform.
*   **`connectors/marketing-presets.json`:** Fully transportable, declarative integration configurations. These schemas describe the endpoint constraints and data-binding mappings for specific marketing platforms, allowing agencies to duplicate proven lead-trapping strategies across different standalone **Workspaces** instantly.

### II. Edge Personalization Schemas (`/segments/`)
*   **`segmentation-routing-rules.json`:** A lightweight JSON routing map exported alongside your static HTML builds. It dictates edge-level node substitution paths (e.g., `{"if": "cookie.segment == 'VIP'", "swap": {"node-12": "node-14"}}`). This file is injected directly into production **Edge Middleware** engines (Cloudflare Workers or Vercel Middleware) to process lighting-fast personalization at the CDN edge before hitting the server.

### III. Hardened Client Storage (`SQLCipher Mobile Container`)
*   **`encrypted_offline_mutations.db`:** Triggered natively inside the Capacitor **App Mode** framework. When a mobile application compiled by Whoobe processes form submissions or lead collection offline, the local client-side SDK encrypts the payload bodies inside a local SQLite container backed by **SQLCipher** and unlocked via biometrics (FaceID/TouchID), preserving absolute data security on lost hardware until the next network reconnect sync event.

---

## 5. Phased Implementation Roadmap



Phase 1: Contextual Triggers ➔ Phase 2: Dynamic JSON Personalization ➔ Phase 3: Visual XState Canvas

### 📅 Phase 1: Contextual Form Triggers (Short-Term)
*   **Objective:** Optimize the completed Form Mapping UI and Gateway architecture.
*   **Task:** Harder the client-side SDK to gracefully parse vendor responses (HubSpot/Brevo API returns), handling real-time interactive loading states and mutating local UI feedback loops (success overlays, dynamic error fields) conditionally based on the external profile payload.

### 📅 Phase 2: Dynamic JSON Personalization (Medium-Term)
*   **Objective:** Implement structural segment filtering at the API layer.
*   **Task:** Extend the core `@whoobe-cms/schema` Zod node models to accommodate an optional `visibilityRules` configuration dictionary. Build the server-side personalization middleware within `core-api` to recursively traverse the layout JSON document and strip out mismatched nodes prior to outputting responses to the public SDK.

### 📅 Phase 3: Visual XState Canvas (Long-Term)
*   **Objective:** Bring full automation visual design to non-technical editors.
*   **Task:** Map the node vectors, connectors, and block properties of the existing **Isometric Canvas Element** onto actionable XState execution hooks. Turn the visual drawing tool into an executable iPaaS orchestrator capable of triggering complex background pipelines across federated REST APIs securely.

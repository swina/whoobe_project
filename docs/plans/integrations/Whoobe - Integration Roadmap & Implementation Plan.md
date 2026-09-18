Here is the complete strategic plan for the **Integration Roadmap** and the **Implementation Plan** for Whoobe.  
This document is structured to be inserted directly into the technical proposal or official project documentation. It is designed to show partners and investors how the **Full-CRUD API Gateway** and **Mobile Generation (Capacitor)** will become the cornerstone of a scalable enterprise ecosystem, minimizing custom code development thanks to Auto-Schema Detection.

# **🗺️ WHOOBE: INTEGRATION ROADMAP & IMPLEMENTATION PLAN**

Whoobe's strategic goal is not to write custom code for every single external platform, which would increase the monorepo's technical debt. By leveraging the native gateway's Auto-Schema Detection, Whoobe adopts a **"Configuration as a Connector"** approach: integration occurs by reading the OpenAPI/Swagger specifications or JSON payloads of remote services, instantly mapping them into reusable visual blocks.

# **1\. Connector Architecture (The @whoobe-cms/connectors Model)**

All connectors will reside in an isolated package within the monorepo. Each integration will be defined by:

&nbsp;

1. **A JSON/TypeScript configuration file** describing the endpoints (GET, POST, PUT, PATCH), authentication rules (Bearer Token, OAuth2, API Key), and pointers to OpenAPI specifications.  
2. **A secure proxy in the core-api**: The client (web or Capacitor mobile app) queries only Whoobe. The Gateway intercepts the request, injects the encrypted credentials stored in Postgres, and executes the call to the remote service, protecting sensitive tokens from reverse engineering.

# **2\. The Integration Roadmap (Phased Release)**

flowchart LR&nbsp;&nbsp;

&nbsp;

&nbsp;&nbsp;&nbsp;&nbsp;Phase1\[Phase 1: Core E-Commerce & CRM\] \--\> Phase2\[Phase 2: Enterprise ERP & Automations\]&nbsp;&nbsp;

&nbsp;

&nbsp;&nbsp;&nbsp;&nbsp;Phase2 \--\> Phase3\[Phase 3: Marketplace & Ecosystem\]

## **🔹 Phase 1: Core Foundations (Standard E-Commerce & CRM) — *Target: MVP / Beta Launch***

Focused on high-demand integrations to validate write forms and the local PIM.

&nbsp;

* **Shopify (Admin & Storefront API):** Two-way synchronization of Whoobe PIM products and headless cart management.  
* **Stripe (Payment Gateway):** Mapping a "Pay Button" element in the visual builder that connects Stripe webhooks to Whoobe's XState publication states.  
* **HubSpot & Brevo (CRM & Marketing):** Automatic mapping of Whoobe form fields for secure lead submission and marketing list sign-ups.

## **🔹 Phase 2: Enterprise Middleware (ERP & Supply Chain) — *Target: v1.0 Stable***

Focused on the complex enterprise market and intensive use of the Capacitor mobile generator (e.g., logistics and sales force).

&nbsp;

* **SAP (OData / REST Gateway):** Connector for real-time inventory reading and order writing from mobile apps.  
* **Microsoft Dynamics 365:** Integration for synchronizing customer master data and complex industrial catalogs.  
* **MedusaJS:** Native coupling with the open-source TypeScript e-commerce framework to create a 100% open commercial suite free of SaaS licenses.

## **🔹 Phase 3: The Open Ecosystem (Community & Custom Connectors) — *Target: Post v1.0***

* **Universal OpenAPI Generator:** A UI interface in the dashboard where the user pastes any Swagger/OpenAPI URL and Whoobe *automatically* generates the connector without touching code.  
* **Whoobe Integrations Marketplace:** Hub to enable third-party developers to publish and distribute their enterprise JSON connectors.

# **3\. Technical Implementation Plan (Operational Milestones)**

The plan unfolds across **5 consecutive Sprints**, focused on Gateway infrastructure and the mobile build cycle.

## **📅 Sprint 1: Integrations Database & Proxy Security**

* **Goal:** Create foundations on Postgres and reinforce the Gateway.  
* **Tasks:**  
  * Define the Drizzle ORM schema for the `integrations` table (fields: `name`, `base_url`, `auth_type`, `auth_credentials` \[encrypted with AES-256\], `status`).  
  * Implement proxy middleware in Node/Express that intercepts `/api/gateway/:integration_name/*` paths, decrypts credentials, and forwards the request.

## **📅 Sprint 2: Auto-Schema Detection Engine**

* **Goal:** Allow the builder to understand external APIs without intermediate code.  
* **Tasks:**  
  * Write the runtime parser that executes a test GET call to the remote endpoint or reads its Swagger file, converting the response into a JSON tree structure of keys and data types (`string`, `number`, `boolean`).  
  * Develop the `GET /api/gateway/:id/schema` endpoint that returns this schema to the admin dashboard.

## **📅 Sprint 3: Visual Data-Binding in the Builder (whoobe-one-spike)**

* **Goal:** Bring external data to the designer's hands.  
* **Tasks:**  
  * Integrate an "External API" tab in the Vue 3 builder sidebar listing active connectors and their data trees.  
  * Develop a drag-and-drop interface for binding (e.g., mapping block text to the `gateway.hubspot.lead_name` key).  
  * Update output Zod validation schema to include nodes flagged with `dataSource: 'gateway'`.

## **📅 Sprint 4: Payload Writing (POST, PUT) & Offline Management for Capacitor**

* **Goal:** Make the mobile app interactive and efficient even offline.  
* **Tasks:**  
  * Configure the "Form" element in the builder to map inputs to payloads required by the Gateway's write routes (POST/PUT).  
  * Develop an **offline request queue (Offline Queueing)** in SQLite/IndexedDB within the Capacitor SDK: If the mobile app is offline, form data (e.g., a new SAP order) is saved locally. A network listener (Capacitor Network Plugin) flushes the accumulated queue to the Whoobe Gateway once connectivity is restored.

## **📅 Sprint 5: Integration Testing & PoC (Pilot 1\)**

* **Goal:** Validate architecture on a real use case.  
* **Tasks:**  
  * Configure a real connector (e.g., HubSpot or a complex mock ERP).  
  * Create a web page and a mobile app build (.apk) with Capacitor to test Auto-Schema Detection, real-time rendering, and write payload submission via form modules.  
  * Release initial documentation in the "Integrations" section.

# **4\. Success Indicators (Launch KPIs)**

To measure the effectiveness of this roadmap during the sandbox phase and early open-source release months, we will monitor:

&nbsp;

1. **Time-to-Integration:** Time spent by an external developer to map a new REST API (target is under 10 minutes via configuration).  
2. **App Offline Stability:** Zero data loss on queued payloads during forced disconnection tests on the Capacitor generator.  
3. **Monorepo Adoption:** Number of enterprise forks contributing JSON files to the `@whoobe-cms/connectors` folder.

&nbsp;

What do you think of this sequential structure? If you are satisfied with the logical setup of this roadmap, we can proceed by writing the definitive Drizzle ORM schema for the integrations table (Sprint 1\) to secure the database logic, or we can define the sample JSON file structure for a connector (e.g., HubSpot). How would you prefer to **proceed**?
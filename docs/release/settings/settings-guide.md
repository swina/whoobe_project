# Settings guide

Where to change what, in the dashboard. Each card is protected by the permission of the route behind it (table in section 8; administrators have all of them); some settings are per website. Secrets entered here are write-only: the dashboard never shows them again.

## 1. Settings (sidebar entry)

| Card | What you set |
|---|---|
| **General** | The default placeholder image for new image elements (a library asset); the default autosave interval of the editor (people can override it for their own session); whether HTML comments are stripped in the page preview; **system logging** on or off for the three backends (takes effect within about 30 seconds, no restart) |
| **DAM** | The media-library backend as the services see it (processor address, bucket, endpoint, key prefix, public base URL or CDN; the bucket credentials are server-side only), and the installation's default **CDN mirroring** (Cloudinary or Cloudflare Images; each website can have its own in Websites > Settings: [publishing](../content/publishing/website-publishing.md), step 1b) and the **folder visibility rules** (which folders are public and which private); see [asset management](../dam/asset-management.md) |
| **Classes** | *Classes*: define Data Classes and their fields, view and list layouts ([data model](../data/data-model.md)); *Pimcore*: sources for importing classes, objects and documents from a Pimcore installation (credentials stored encrypted); *File*: placeholder for CSV, JSON and XLSX import, not implemented |
| **Workflows** | The workflow of a Data Class: places, transitions, who may trigger them, whether a transition publishes ([data model](../data/data-model.md), section 5) |
| **Figma** | The Figma access token used by the Figma import *(beta)*; the token is stored encrypted |
| **Custom fonts** | Your own fonts (`.woff2`), shared by every website of the workspace. Choose all the files of a family together: the family, weight and style are guessed from the file names and can be corrected before you add them. The files are kept in the DAM folder `/public/fonts` (they must be public: a published site cannot read a private file) and are listed in the editor's font lists. A published site, a mobile app and a form-notification email use them: the site and the app **carry a copy of the files**, so they work without Google Fonts or the DAM; an email links the public address of the file, and only mail clients that load web fonts (Apple Mail, iOS Mail) show it. Only upload fonts you hold a web licence for. |
| **PWA** | Per website: the app settings, the **push notification provider** (self-hosted with automatically generated VAPID keys, or a provider such as OneSignal) and a **preview of the generated mobile app** |
| **Form uploads** | Per website: whether forms accept files, which types (only those whose content can be verified), the maximum size and number of files, and the default private folder in the library |

## 2. AI (sidebar entry)

*AI Agent*, *AI Image Generation* and *AI Translation*: provider, model, optional endpoint and your own key. See [AI features](../ai/ai-features.md).

## 3. Websites and their settings

*Websites* is where a website is created and configured: its name, **domains**, supported **locales**, menus, themes and templates, and the
per-website options above (PWA, form uploads). A website is **not** a security boundary: roles apply to the whole workspace
([design decision](../architecture/design-decisions/one-workspace-per-organisation.md)).

## 4. Outgoing mail

*Outgoing Mail* configures how the installation sends mail: a **default** sender for every website without its own, and optionally one per
website. Each is **SMTP** or an **HTTP mail provider**. Passwords and provider keys are write-only and encrypted with `MAIL_SETTINGS_ENCRYPTION_KEY`.
The same area holds the **mail log** (every send attempt) and the **reusable templates** that form notifications refer to. See [mail providers](../communication/mail-providers.md).

## 5. Integrations and API clients

Configured in their own entries, not under *Settings*: *Integrations* (endpoints, routes, credentials, presets, plugins) and *API clients*
(applications that call Whoobe). See [Communication](../communication/README.md). They need the `gateway:manage` permission.

## 6. System logs

*Security > System Logs* shows the logs of the services and keeps files in the media store; the logging switch is in *Settings > General*
([observability](../operations/observability-and-logging.md)).

## 7. What is not a dashboard setting

Everything the services read at start-up is an environment variable: database and storage connection, host names and ports, the encryption keys
(`GATEWAY_AUTH_ENCRYPTION_KEY`, `MAIL_SETTINGS_ENCRYPTION_KEY`, `INTEGRATION_SECRETS_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY`), rate limits (`AI_RATE_LIMIT_PER_MINUTE`,
`PUBLIC_QUERY_RATE_LIMIT_PER_MINUTE`...), the rate-limit store (`GATEWAY_RATE_LIMIT_BACKEND`, `GATEWAY_REDIS_URL`), proxy trust (`TRUST_PROXY`),
and the sandbox profile. They are listed with their defaults in the [configuration reference](../operations/configuration-reference.md), and
workspaces get their own generated `.env` file ([creating workspaces](../operations/creating-workspaces.md)).

## 8. Who can change what

| Area | Permission |
|---|---|
| General (placeholder, autosave, comments, logging) | `objects:write` |
| Form uploads, AI, Figma, custom fonts, mail | `settings:manage` (anyone signed in can see the list of fonts, the editor needs it) |
| DAM rules, PWA | the asset-processor and website routes behind them; the exact permission of each route is in the [API reference](../api/api-reference.md) |
| Users and roles | `users:manage` |
| Workflows | `workflows:manage` |
| Integrations and API clients | `gateway:manage` |
| Publishing an object | `objects:publish` |
| Your own second factor | any signed-in user |

Permissions are checked per route on the server; the dashboard hides what a person cannot use, but hiding is not the control
([authentication and authorization](../architecture/authentication-and-authorization.md)).

## 8. Security (sidebar entry)

The pages about who may sign in and what they may do moved out of Settings into their own entry, **Security**. Each page is shown by permission.

| Page | What it is | Permission |
|---|---|---|
| **Roles/Users/Workspaces** | *Users*: create, edit, deactivate, reset the password of an account; *Roles*: create roles and choose their permissions. Four roles exist by default (`admin`, `editor`, `viewer`, `publisher`) | `users:manage` |
| **Two-Factor Authentication** | Your own two-factor authentication (TOTP), with recovery codes | everybody |
| **Sign-in Requirements** | Which roles must use two-factor authentication, and the minimum password length and rules ([authentication](../architecture/authentication-and-authorization.md)) | `settings:manage` |
| **SSO** | Sign in with your identity provider ([single sign-on](../operations/single-sign-on.md)) | `settings:manage` |
| **Data Subject Requests** | Find, export or erase everything held about one person, and the retention periods ([procedure](../operations/data-subject-requests.md)) | `data_subject:manage` |
| **System Logs** | The logs of the services | everybody |
| **Audit Logs** | Who changed what, and when ([audit log](../operations/audit-log.md)); also the shield in the top bar | `audit:read` |

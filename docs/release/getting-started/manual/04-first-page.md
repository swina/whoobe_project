# 4. Your First Page, Start to Finish

This chapter walks through the smallest complete path through Whoobe: create a website, create a page inside it, put something on the page, and publish it. Each step here is covered in far more depth later in the manual — the point of this chapter is to see the whole loop once, end to end, before going deep on any one part of it.

## Step 1 — Create a website

Everything in Whoobe belongs to a **website**: a set of pages sharing a preview path, a default locale, and (once it's live) one or more real domains.

1. Open **Websites** in the sidebar.
2. Click **+ New Website**.
3. You'll be asked for a name, then a default locale (e.g. `en`) — these are the only two things required to create the record; everything else can be filled in afterward.

Creating the website opens its own tab, on the **Settings** sub-tab. Fill in:

- **Name** — already set from what you just typed.
- **Root preview path** — required, and must look like `/something` (lowercase letters, digits, hyphens, underscores only — e.g. `/default`). Every page in this website is previewed under this path (`/default/about-us`), so pick something short and don't expect to change it casually later — it's baked into every preview link you'll share until you do.
- **Domains** — one per line. Leave this empty for now if you don't have a real domain ready; you can preview and even publish pages without it. Domains matter once you're ready to actually go live (Chapter 16, "Publishing a Website").
- **Default Locale / Supported Locales** — a comma-separated list if you'll support more than one language.
- **Theme** — optional; assigns a saved set of colors and fonts (Chapter 7, "Themes") to every page in this website unless a page overrides it.

Click **Save**.

The website tab has two other sub-tabs you can ignore for now: **Paths**, which defines the site's navigation-menu structure (Chapter 16), and **Templates**, which assigns shared page templates to specific paths — neither is required just to get one page live.

## Step 2 — Create a page

1. Open **Pages** in the sidebar.
2. Click **+ Create Page**.

This opens a new page tab on its **Settings** sub-tab, showing a short creation form — not yet the full settings screen, since most of that only makes sense once the page exists:

- **Title** — e.g. "About Us".
- **Slug** — auto-suggested from the title (`/about-us`) as you type; edit it if you want something different.
- **Category** — an optional free-text tag, useful for organizing a large Pages list later.
- **Page Type** — **Standard Page** for a normal web page, or **Mobile App** if this page is meant to become a screen in a generated native app shell (Chapter 17).

Click **Create Page**. The tab switches straight to the **Editor** sub-tab — the page now exists, but it isn't attached to the website you just created yet, and it isn't published.

## Step 3 — Add some content

The **Editor** sub-tab embeds Whoobe's visual page builder: a canvas where you drag blocks (text, image, button, and more) into place. Chapter 5, "The Page Builder," covers it properly — for now, just add a text block or two so there's something to see. Everything you do here saves automatically as you work; there's no separate "save the content" step.

If you'd rather work full-screen, the expand icon next to the sub-tab buttons opens the same editor in a full-screen overlay.

## Step 4 — Attach the page to your website and publish it

Switch to the page's **Settings** sub-tab — now the full settings screen, since the page exists. On the **General** section:

- **Website** — pick the website you created in Step 1. A page with no website assigned can't be reached at any real URL.
- **Locale** — matches one of the website's supported locales.
- **Published** — check this box. This is the actual "publish" switch: an unpublished page stays visible to you in the dashboard but won't be served at its public URL.

There's also a **Workflow State** free-text field (e.g. `draft`, `review`, `approved`) if your team uses one — it's informational and independent of the Published checkbox; a page can be `approved` and still unpublished, or vice versa.

Click **Save**.

For working on many pages at once, the Pages list also has a multi-select mode: tick several rows and a bar appears at the bottom with bulk **Publish**, **Unpublish**, and **Delete** actions — useful once you have more than a couple of pages, not needed for this first one.

## Step 5 — Preview it

Two ways to look at the result:

- The **Preview** sub-tab renders the page inside the dashboard itself.
- The **external-link icon** next to the sub-tab buttons opens the page in a new browser tab, at its real preview URL: your website's root preview path plus the page's slug (e.g. `/default/about-us`).

This preview URL lives on Whoobe's own editor origin, tied to the website's root preview path — it's not yet your real public domain.

**Where the preview is, exactly.** The preview is served by the editor application, which is mounted at a base path that depends on how Whoobe is installed: on a local development setup it is the editor's own address (`http://localhost:3006/default/about-us`); on a workspace (Docker, behind nginx) it sits under `/whoobe-one/` of the dashboard's host name (`https://dashboard.example.com/whoobe-one/default/about-us`). So the root preview path is the part *after* `/whoobe-one/`, and typing `https://dashboard.example.com/default/about-us` into the browser opens nothing useful (the dashboard has no such page and shows an empty one). The links you put in your pages are the site's own paths, root path included (`/default/blog`); in the preview they are followed inside the editor, whatever the base path is. Getting an actual domain serving these pages to the public is a separate, later step covered in Chapter 16, "Publishing a Website."

## What you just did, in one sentence

You created a website (a container for pages, locales, and eventually a domain), created a page inside it, gave it some content through the visual builder, and flipped the switch that makes it servable — the same loop you'll repeat for every page you build in Whoobe.

## What's next

**Chapter 5, "The Page Builder,"** goes deep on the canvas you glossed over in Step 3 — the block palette, layout controls, responsive preview, and undo history.

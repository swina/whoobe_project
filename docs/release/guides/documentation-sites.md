# Documentation sites (from Markdown files)

A **documentation site** is a website whose pages are not built in the editor but written as **Markdown files** kept in a
folder of the asset library. Whoobe turns the folder into a site with an index (sidebar), a table of contents for each
page ("On this page"), breadcrumbs, previous/next links and **search**. It can be published as plain static HTML.

## Create one

1. **Settings > Websites > + New Documentation.** Give it a name and the **folder of the asset library** that holds the files
   (for example `/docs/product`). Nothing is created in the folder; it is filled in the next step.
2. The **Documents** window opens. Create documents (**+ New document**: a path such as `guide/install.md`) or **upload**
   files or a whole folder (`.md`, and the images and PDFs they use; the editor's **Insert image** button also uploads). Keep the structure you want: **folders are sections**.
3. Open the site at its **root path** (the *Preview site* link): `https://your-host/<root-path>/`.

## Writing

Plain Markdown (GitHub flavour: tables, task lists, fenced code with a language) plus:

- **Front matter** at the top of a file (all optional):

  ```yaml
  ---
  title: Install Whoobe          # default: the first "# heading", else the file name
  description: One line summary
  order: 20                      # position among its siblings (lower first)
  hidden: false                  # not listed in the index, still reachable by its address
  slug: setup                    # last part of the address instead of the file name
  ---
  ```
- **Notes**: `:::tip`, `:::note`, `:::info`, `:::warning`, `:::danger` ... `:::` (an optional title after the keyword).
- **Links between documents** are written as files: `[install](01-install.md#steps)`, `[usage](../guide/usage.md)`. They become
  the site's addresses. Images and files the same way: `![diagram](../images/flow.png)`. A link to a file that does not exist is
  reported in the editor while you write (and in the Documents tab), and shown as a dead link.
- **Images**: `![description](../images/schema.png)` - a path **relative to the document**, to an image in the documentation
  folder (or an `https://` address). With a width and a position:

  ```markdown
  ![Architecture](../images/architecture.png){width=60% align=center}
  ![Screenshot](shot.png){width=320px float=right}
  ```

  `width` is a number with `px`, `%`, `rem`, `em` or `vw` (a bare number is pixels; at most 100% for `%`/`vw`);
  `align` is `left`, `center` or `right` (the image on its own line); `float` is `left` or `right` (the text wraps around it).
  Anything else in the braces is ignored and reported. **Insert image** in the editor writes all of this for you: choose an image
  of the folder, of the **asset library** (one outside the folder is *copied* into `images/` so the path stays relative and the
  published site is self-contained), **upload** a new one, or give an **address**; then pick the width and the position.
  An image must be public to appear on the public site.
- **Raw HTML**: a block of HTML is allowed and cleaned (scripts, event handlers and `javascript:` addresses are removed);
  a tag in the middle of a line is shown as text.

The editor window shows the source on the left and the page on the right, as the visitors will see it. **Save** makes a new
version of the file (asset versions); **Public** decides whether the file is shown to visitors.

## The index

By default the index is **rebuilt from the tree of files**: folders are sections, `index.md` (or `README.md`) of a folder is the
page of its section, documents are ordered by `order` and then by file name (numeric prefixes like `01-` sort first and are not
shown in titles or addresses).

To take control, open the **Index** tab: **Start from the folders** fills a text with the current structure in YAML; edit it and
**Save index** (stored as `_nav.yml` in the folder; **Check** validates it first, a broken text is never saved):

```yaml
- title: Getting started
  items:
    - doc: getting-started/install.md
    - doc: getting-started/first-site.md
      title: Your first site
- title: Reference
  index: reference/index.md      # optional: the section's own page
  items:
    - doc: reference/api.md
- link: https://example.org/changelog
  title: Changelog
```

Documents the text does not mention are listed at the end under **Other** (and reported), so none becomes unreachable by
mistake. **Use the folders again** deletes `_nav.yml`.

## Who sees what

- **Public** files only are shown on the public site. A **private** file is not listed, not served and not linked (a link to it is
  a dead link). People signed in to the dashboard who can see assets see the private ones too, marked *preview* in the header.
- Visibility is the asset's: set it when uploading (*Uploaded files are public*) or with the **Public** box in the editor.

## Search

The box in the header (and **Ctrl/Cmd K**) searches titles, section headings, descriptions and the text of every page, as you
type. It tolerates small typos, ignores accents and capital letters, finds the start of a word, and when you write several
words all of them must be in the page. A result can be a page or one of its sections (a section opens the page at that
heading). The index of words is a file the browser downloads once; the search itself runs in the browser. Not signed in, it
contains public documents only; signed in, the private ones too.

## Publish as a static site

The **Publish** tab shows the command; or run `./publish-site.sh` and choose **4) Documentation**:

```bash
node packages/publish/bin/whoobe-publish.js --kind docs \
  --api-url https://cms.example.com --website-id <id> --out-dir ./sites/docs \
  --base-path /docs --site-url https://example.com --asset-base-url https://cms.example.com
```

The output folder is plain HTML you copy to any web server (`rsync -a --delete ./sites/docs/ user@host:/var/www/docs/`):

- one `index.html` per page (`guide/install/index.html`), `404.html`, `sitemap.xml` (with `--site-url`), `robots.txt`;
- `assets/`: the styles, one small script (menu, "on this page", copy buttons, search), MiniSearch, the search index
  (`search-index.json`) and the images and files the documents use (copied; `--no-copy-assets` links to the CMS instead);
- code is highlighted in the browser with a library that is loaded only on pages that have code;
- it follows the visitor's light/dark preference and prints cleanly.

Only **public** documents are published, read from the public API, so a private file cannot end in the output. Broken links
are listed; `--strict` makes them an error (useful in a CI job). Running it again replaces the pages and removes the ones that
no longer exist. `--base-path` is the path the site is served under (`/` for a domain of its own); the links already contain it.

## What is where

| | |
|---|---|
| Source | the folder of the asset library (`settings.docs.sourceFolder`), edited as ordinary assets |
| Index | `_nav.yml` in the folder, or the tree of files |
| Settings | the **Settings** tab: title, source folder, home document |
| API | [`/docs-sites/...` and `/public/docs/...`](../api/api-reference.md) |
| Plan and phases | [`docs/plans/docs-sites/docs-site-plan.md`](../../plans/docs-sites/docs-site-plan.md) |

Not yet (planned): a drag-and-drop editor for the index (it is a YAML text with a check), several languages and versions, the layout as a template of an ordinary website, search results with the matching words highlighted.

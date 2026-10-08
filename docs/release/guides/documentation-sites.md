# Documentation sites (from Markdown files)

A **documentation site** is a website whose pages are not built in the editor but written as **Markdown files** kept in a
folder of the asset library. Whoobe turns the folder into a site with an index (sidebar), a table of contents for each
page ("On this page"), breadcrumbs, previous/next links and, in the next phase, search.

## Create one

1. **Settings > Websites > + New Documentation.** Give it a name and the **folder of the asset library** that holds the files
   (for example `/docs/product`). Nothing is created in the folder; it is filled in the next step.
2. The **Documents** window opens. Create documents (**+ New document**: a path such as `guide/install.md`) or **upload**
   files or a whole folder (`.md`, and the images and PDFs they use). Keep the structure you want: **folders are sections**.
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

## What is where

| | |
|---|---|
| Source | the folder of the asset library (`settings.docs.sourceFolder`), edited as ordinary assets |
| Index | `_nav.yml` in the folder, or the tree of files |
| Settings | the **Settings** tab: title, source folder, home document |
| API | [`/docs-sites/...` and `/public/docs/...`](../api/api-reference.md) |
| Plan and phases | [`docs/plans/docs-sites/docs-site-plan.md`](../../plans/docs-sites/docs-site-plan.md) |

Not yet (planned): search, publishing as a static site, several languages and versions, the layout as a template of an ordinary website.

# Generate Website Wizard

The wizard makes a **first version of a website from a few choices**, for people who build sites in the dashboard and do not want to start from an empty page
or to handle a file: what the site is for, how it looks, which pages it has and which blocks each page is made of. The website is created as a **draft**
that you read and improve in the editor. Nothing is published, and nothing is sent outside the installation: the structure comes from fixed templates, not from a model.

Where: **Settings > Websites > Generate Website Wizard**, a tab of its own. You need the permission *websites:create* (or *objects:write*).

## The steps

1. **Basics.** The name of the website, the **sector** (IT, Food, Consultant, Insurance, Tourism) and the **market context**, a few words of free text ("hotel", "bakery").
   The sector chooses the placeholder texts and proposes a structure; the context fills the noun they use ("our hotel"). The language is English.
2. **Look.** One of four colour themes (*Dark*, *Light*, *Light colours*, *Blue navy*), **a palette of your own** (see *Your own palettes* below), **or a company colour**: the background of the site, for example `#323932`. From the
   background the wizard works out the other colours (text, boxes, borders, buttons) and keeps them readable, whatever colour you choose: a text always reaches at
   least the contrast that accessibility guidelines ask for (WCAG AA). An optional **accent colour** sets the buttons; if it would be hard to see on the background it is
   lightened or darkened and you are told. The fonts are **sans-serif** or **serif** (the families of the visitor's system: no font is requested from an outside service).
3. **Pages.** A landing page and up to three more. Each page has a title and a **structure**: an ordered list of blocks that you add, remove and move. The header and the
   footer are made from the pages, in this order; you can show a contact button in the header. At any position you can use **a snippet of your library** instead of a
   generated block (the library snippets whose category is a block name, such as *Hero* or *Call to action*, are offered under *From your library*; a snippet you set as a **wizard block** in *Content > Snippets* (the *Wizard block* column, any category) is listed with the default blocks; you can give it **a name of your own** in that column, and choose *New block (own name)* to add a block of a kind the wizard does not have, such as *Testimonials*). The pages can be **moved up and down** (the order is the order of the menu, and the first is the landing page) and **collapsed** (one by one, or *Collapse all*). The box on the right shows the structure of all the pages; the eye of a page (or a click in its title) shows **only that page**, and *View all* brings the others back.
4. **Texts.** Placeholder texts, written for the sector. They are plain and generic on purpose: they are there to be replaced in the editor.
   Or **Write the texts with the AI**: offered when an AI provider is set up in *Settings > AI*, you may write content, and this is not the public sandbox. You can add a short
   description of the business; the configured model then gets **the name of the business, the sector, the context, that description and the list of texts to write** (what
   each is and how long), and nothing else, and it answers with those texts only. Each reply is read text by text: a text that is not one of the list is dropped, markup is
   removed and every text is cut to its length, so the model **cannot change the structure, the classes, the links or the images** of the site. The texts are shown to
   you, one field each, to read and change before you create the website; a text the model did not write keeps its placeholder. If you change the pages the texts are
   cleared, because they were written for that structure. Calls are counted by the same rate limit as the other AI features, and a record of each is kept in the AI log.
   No claim is made about the quality of what a model writes: read it.
5. **Check and create.** The wizard shows what will be created: the website with its name and root path (both can be changed), the pages, the snippets, the theme.
   If a theme or a snippet with the same name already exists you choose, for each, to **create a new one** (the default, under a free name such as *Seaview (2)*) or to
   **use the existing one**; an existing theme or snippet is never changed or replaced. Then **Create as a draft website**: a window says it was created and offers **Preview** (the site with its draft pages) and **Manage** (the settings of the website). The same window follows an import from a specification. The pages are drafts, so the public address answers *Page not found* until you publish them; to look at the site before that, use **Preview** on the website in *Settings > Websites*: it opens the site with its draft pages, marked with a **Draft preview** badge, and only for a signed-in editor.

## The blocks

| Block | What it is |
|---|---|
| Hero | The opening of a page: a heading, a line, buttons and a picture (a placeholder you replace). On the landing page it has the welcome and two buttons; on an inner page, its title and a plain line. |
| Banner | A narrow band with one message and a link. |
| Call to action | A closing box with a heading, a line and a button. |
| Box grid 3 | A heading and three boxes with a title and a text each. |
| Box grid 6 | A heading and six boxes in two rows of three. |
| Page title | A plain band with the title of the page, as its heading of the first level. Not added by itself: put it first on a page that has no hero. |
| Contact form | A form with *name*, *email* and *message*. It is created **not connected**: no data class, no endpoint, no recipient, no notification. A developer connects it later in the editor. |

Nothing is added to a page that you did not ask for. A page needs a heading of the first level for search engines: a hero or a *Page title* gives it, and the check step tells you about a page that has neither. A page with no block at all gets the page title, because a page needs at least one section. The buttons that say "contact" lead to the first contact form of
the site, or to the last page when there is none.

## Placeholders in your snippets

A snippet of your library that the wizard uses can carry placeholders in its texts, so the same snippet reads right for any site: `{name}` (the name of the website),
`{context}` or `{thing}` (the market context you typed, or the noun of the sector, for example *hotel*) and `{sector}` (for example *Tourism*). They are filled in the
**copy** that goes into the page, in the texts and the descriptions of images; the snippet in the library is never changed, and the ids, classes, styles and links are
left as they are. The words are plain text (no markup). A placeholder the wizard does not know stays as written. This happens only in the wizard: a site imported from a
specification written by hand gets the snippets as they are.

## Your own palettes

*Manage palettes* (in the *Look* step) opens a window where you make, change and delete palettes. A palette is **eight colours, each with one job**: the page, the alternate
sections, the boxes, the text, the muted text, the borders, the buttons and the text on the buttons. The four built-in themes cannot be changed; **copy** one to start from
it. The window shows a sample and, as you type, the pairs of colours that are **hard to read** (the same limits as the rest of the wizard: 4.5 for text, 3 for buttons).
A palette with such pairs is **saved all the same** and used **as it is**: the wizard marks it *hard to read* and repeats it in the notes of the check, but never changes
your colours (it does that only for a company colour and for the accent). Names are unique. Deleting a palette does not touch the websites already made from it: they
have their own theme.

## What to expect

The result is a **starting point**. Every site made this way has the same bones, which is what makes it reliable; the editor is where it becomes yours. The placeholder
texts are generic and the context only changes a noun, so "bakery" under *Food* still reads like a restaurant until you edit the words. The pictures are placeholders.
Names of links and pages follow the titles you typed.

## For developers

The wizard is two routes: `GET /whoobe-one/site-wizard/options` (what it offers) and `POST /whoobe-one/websites/from-wizard` (`?dryRun=1` for the check), documented in the
[API reference](../api/api-reference.md). The answers become a [site specification](site-from-specification.md) that is checked and imported like one written by hand, so the
same rules and the same audit entry (`website.create_from_wizard`, not written for a check) apply. The engine is `packages/core/src/site-wizard/` and its plan is
`docs/plans/ai/template-wizard.md`.

# Generate Website Wizard

The wizard makes a **first version of a website from a few choices**, for people who build sites in the dashboard and do not want to start from an empty page
or to handle a file: what the site is for, how it looks, which pages it has and which blocks each page is made of. The website is created as a **draft**
that you read and improve in the editor. Nothing is published, and nothing is sent outside the installation: the structure comes from fixed templates, not from a model.

Where: **Settings > Websites > Generate Website Wizard**, a tab of its own. You need the permission *websites:create* (or *objects:write*).

## The steps

1. **Basics.** The name of the website, the **sector** (IT, Food, Consultant, Insurance, Tourism) and the **market context**, a few words of free text ("hotel", "bakery").
   The sector chooses the placeholder texts and proposes a structure; the context fills the noun they use ("our hotel"). The language is English.
2. **Look.** One of four colour themes (*Dark*, *Light*, *Light colours*, *Blue navy*), **or a company colour**: the background of the site, for example `#323932`. From the
   background the wizard works out the other colours (text, boxes, borders, buttons) and keeps them readable, whatever colour you choose: a text always reaches at
   least the contrast that accessibility guidelines ask for (WCAG AA). An optional **accent colour** sets the buttons; if it would be hard to see on the background it is
   lightened or darkened and you are told. The fonts are **sans-serif** or **serif** (the families of the visitor's system: no font is requested from an outside service).
3. **Pages.** A landing page and up to three more. Each page has a title and a **structure**: an ordered list of blocks that you add, remove and move. The header and the
   footer are made from the pages, in this order; you can show a contact button in the header. At any position you can use **a snippet of your library** instead of a
   generated block (the library snippets whose category is a block name, such as *Hero* or *Call to action*, are offered). A box on the right shows the structure.
4. **Texts.** Placeholder texts, written for the sector. They are plain and generic on purpose: they are there to be replaced in the editor. (Writing the texts with the
   configured AI is planned and not available yet.)
5. **Check and create.** The wizard shows what will be created: the website with its name and root path (both can be changed), the pages, the snippets, the theme.
   If a theme or a snippet with the same name already exists you choose, for each, to **create a new one** (the default, under a free name such as *Seaview (2)*) or to
   **use the existing one**; an existing theme or snippet is never changed or replaced. Then **Create as a draft website**: the website opens.

## The blocks

| Block | What it is |
|---|---|
| Hero | The opening of a page: a heading, a line, buttons and a picture (a placeholder you replace). On the landing page it has the welcome and two buttons; on an inner page, its title and a plain line. |
| Banner | A narrow band with one message and a link. |
| Call to action | A closing box with a heading, a line and a button. |
| Box grid 3 | A heading and three boxes with a title and a text each. |
| Box grid 6 | A heading and six boxes in two rows of three. |
| Contact form | A form with *name*, *email* and *message*. It is created **not connected**: no data class, no endpoint, no recipient, no notification. A developer connects it later in the editor. |

A page that has no hero starts with a band with its title, so every page has one heading of the first level. The buttons that say "contact" lead to the first contact form of
the site, or to the last page when there is none.

## What to expect

The result is a **starting point**. Every site made this way has the same bones, which is what makes it reliable; the editor is where it becomes yours. The placeholder
texts are generic and the context only changes a noun, so "bakery" under *Food* still reads like a restaurant until you edit the words. The pictures are placeholders.
Names of links and pages follow the titles you typed.

## For developers

The wizard is two routes: `GET /whoobe-one/site-wizard/options` (what it offers) and `POST /whoobe-one/websites/from-wizard` (`?dryRun=1` for the check), documented in the
[API reference](../api/api-reference.md). The answers become a [site specification](site-from-specification.md) that is checked and imported like one written by hand, so the
same rules and the same audit entry (`website.create_from_wizard`, not written for a check) apply. The engine is `packages/core/src/site-wizard/` and its plan is
`docs/plans/ai/template-wizard.md`.

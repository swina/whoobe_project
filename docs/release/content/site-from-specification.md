# Create a site from a specification

A **site specification** describes a whole website as one JSON file: its pages, the header and footer, the theme, the texts and the links.
Any language model can write one from a brief, and Whoobe checks it and turns it into a website that starts as a **draft**. It is the
way to get a first version of a site, in one or two languages, that an editor then reads and improves in the editor.

Whoobe **does not call a model** for this and sends nothing outside the installation: you take the instructions to the model you choose
(a chat in a browser is enough, or a local model) and bring its answer back. The people who do this need only the dashboard: there is no
command line to use.

Where: **Settings > Websites > Import from a spec**. You need the permission *websites:create* (or *objects:write*).

## The steps

1. **Get the material.** The window offers the *instructions* (copy or download), the *JSON Schema* (for models and tools that accept one)
   and two complete *examples* you can start from. If the browser does not allow copying (a plain `http` address on a LAN often does not), the
   text is shown so you can select and copy it by hand.
2. **Ask the model.** Paste the instructions in its chat, then describe the site: who it is for, the pages, the tone, the languages (one or
   two), the real texts, names and links you already have. The instructions tell the model not to invent facts such as prices, hours or addresses.
3. **Bring the answer back.** Paste it in the window, or choose a file, and press **Check**. A model often wraps its answer in a Markdown fence:
   that is taken off.
4. **Read the result of the check.** Each problem is shown with its place in words (*page "Pricing", section 2, element 3: a link needs
   visible text*) and, in small type, the exact path. Correct the text, or paste the list to the model and ask it to fix the problems, and
   check again. Nothing is written by a check.
5. **When the file is valid** the window lists what will be created: the website with its name and root path, the pages (and their
   languages), the snippets, the theme and what goes around every page. You can change the website's **name** and **root path** there; the
   links of the site follow.
6. **Names that already exist.** If the file defines a theme or a snippet whose name is already taken, you choose for each: **create a new
   one** (the default, under a free name such as *Harbour (2)*) or **use the existing one**. An existing theme or snippet is never changed
   or replaced by an import.
7. **Import.** The website is created as a **draft** (no page is published; publishing needs its own permission) and opens. Read it, change
   it in the editor, publish it when it is right.

## What the specification covers

| Covered | Not in version 1 |
|---|---|
| Website name, root path, one or two languages | More than two languages |
| A theme (colours, fonts) of its own, or an existing one by name | Menus |
| Snippets (header, footer, call to action...) of its own, or existing ones by name | Data classes and lists bound to data (a blog) |
| Header, footer, side area and 404 around every page | A different header or footer for each language |
| Pages, each a list of sections made of containers, headings, texts, links and images | Forms, animations, scripts, events |
| Links between the pages of the site, to anchors and to outside addresses | Images from your asset library (an image is a placeholder you replace in the editor) |

A page in two languages is written twice: two entries with the same address and a different language, each with real text in that language.
The header and footer are shared by the two languages, so the instructions ask for words that belong to neither.

## What the checks guarantee, and what they do not

The checks catch **structure**: an unknown key, a link with no text, a link to a page that is not in the file, a script or an event handler, a
class that could break out of its attribute, too large or too deep a page, a reference to a snippet or a theme that does not exist. The text of
a paragraph is cleaned like every rich text in Whoobe; a link can only go to a page of the file, an anchor, or an `https`, `mailto` or `tel`
address.

They cannot tell whether the text is **good, true or in your voice**, or whether the design is pleasant, and how well a given model writes a
specification depends on the model: we do not claim a number. A person reads the draft before it is published.

## For developers

The same function is an API: `GET /whoobe-one/site-spec/material` (instructions, JSON Schema, limits, examples) and
`POST /whoobe-one/websites/from-spec` (`?dryRun=1` for a check), documented in the [API reference](../api/api-reference.md). The creation is
recorded in the [audit log](../operations/audit-log.md) as `website.create_from_spec`; a check is not. The files the dashboard hands out are
in the [`ai-site-spec` folder](ai-site-spec/README.md) of this documentation, next to two examples.

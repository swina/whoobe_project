# Site specification: have any language model draft a site for Whoobe

A **site specification** describes a whole website as one JSON file: its pages, the header and footer, the theme, the
text, the links. Any language model can write it from a brief, and Whoobe checks it and turns it into a website that
starts as a **draft**. Nothing is published by the import, and nothing leaves your installation: Whoobe never calls a
model for this; you take the instructions to the model you choose and bring the answer back.

## How to use it (from the dashboard, no command line)

1. In **Settings > Websites** choose **Import from a spec**. Copy the **instructions** (and, if the model asks for it, the **JSON Schema**).
2. In the chat of the model you use, paste the instructions, then describe the site you want: who it is for, the pages,
   the tone, the languages (one or two), the real texts you already have.
3. Paste the answer in the box of the dashboard (or choose a file) and press **Check**. Every problem is shown with its
   place ("page Pricing, section 2, the link has no text"); correct the file, or ask the model to, and check again.
4. When it is valid, Whoobe shows what it will create. If a theme or snippet with the same name already exists you choose
   to **use the existing one** or **create a new one**; an existing one is never changed.
5. Press **Import**. The website is created as a draft and opens. Read it, change it in the editor, publish it when it is right.

## What is in this folder

| File | What it is |
|---|---|
| `instructions.md` | The text to paste in the model's chat: the format, the rules, what to ask and what not to invent. |
| `examples/cafe.json` | A complete one-language site (header, footer, three pages). |
| `examples/cafe-bilingual.json` | The same idea in two languages, one page written once per language. |
| The JSON Schema | For models and tools that accept one: the dashboard offers it (*Copy the JSON Schema*) and the repository keeps it in `packages/sdk/schema/json/site-spec.schema.json`. |

## What to expect

The schema and the checks catch **structure** (a missing key, a link with no text, a link to a page that does not exist, a
script, too large a page). They cannot tell whether the text is good, true or in your voice, or whether the design is
pleasant. A person reads the draft before it goes live. How well a given model writes a specification depends on the
model; we do not claim a number.

The specification covers pages, header and footer, theme and snippets. **Not in version 1:** menus, data classes and
bound lists (a blog), forms, animations, and images from your library (an image is a placeholder you replace in the
editor).

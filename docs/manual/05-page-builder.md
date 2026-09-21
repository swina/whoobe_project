# 5. The Page Builder

This chapter covers the visual canvas you land on when you open a page's **Editor** sub-tab (Chapter 4) — the block palette, how to select and style what you've placed, responsive preview, and how saving actually works.

## Layout of the builder

The builder has three parts:

- A **toolbar** across the top, with actions that apply to the whole document: New, Save, Theme, Save As, AI Page, AI Image, Figma, Templates, Add to Kit, Export, Import, Settings, Preview, and App Mode.
- The **canvas** in the middle — the page itself, rendered live and editable in place.
- A **right-hand sidebar** with a row of icon tabs: **Elements** (the block palette), **Snippets**, **Customize** (style controls), **Advanced**, **Tree** (a document outline), **Kits**, **AI generations**, and **Integrations** — plus an **App Config** tab that appears only in App Mode (Chapter 17). The sidebar collapses to give the canvas more room via the small arrow on its edge.

When a block is selected, a **floating toolbar** also appears attached to it, with quick actions for that specific block — this is where you'll spend most of your time once something is placed.

## Adding a block

Open the **Elements** tab in the sidebar. Blocks are grouped into four categories:

- **Containers** — Grid, Flexbox, Dropdown Menu. These hold other blocks and control how their children are arranged.
- **Text** — Heading, Paragraph, Inline Text, Span, Blockquote, Code.
- **Media** — Image, Slider, Video, YouTube, Vimeo, Icon, Download link.
- **Form** — Form, Input, Email, Number, Checkbox, Radio Group, Textarea, Select, Submit, Reset, Button.

**Drag** a block from the palette onto the canvas and drop it where you want it — there's no click-to-insert; the palette is drag-only. Dropping onto an existing container nests the new block inside it, which is how you build layout: drag a Flexbox onto the page, then drag other blocks inside that Flexbox to lay them out side by side or stacked.

## Selecting and editing a block

Click any block on the canvas to select it — this highlights it and opens its floating toolbar. For a text block, click a second time (or use the toolbar's pencil "Edit content" icon) to start typing directly in place — this is a real inline edit, not a form field, so what you see while typing is exactly what the block looks like.

Click empty canvas space to deselect.

## The floating toolbar

Once a block is selected, its floating toolbar offers (not every option appears for every block type — a Form field shows different options than an Image):

- **Rename** — give the block a friendlier label; also reachable by double-clicking its blue name tag.
- **Move up / Drag to reposition** — the blue name tag is also a drag handle for repositioning the block.
- **Hide content** — collapses a block down to just its own tag, useful when something is layered on top of it and you need to click through to what's underneath.
- **Add child / Direction (row/column)** — on containers, adds a child block or flips whether its contents lay out side-by-side or stacked.
- **Semantic HTML tag** — changes what actual HTML tag the block renders as, without changing how it behaves in the builder.
- **Text color / Fill color** — quick color swatches, without opening the full Customize panel.
- **Image** — swap the image by URL, upload, or **browse assets** (opens the DAM media picker, Chapter 12), or bind it to a data field (Chapter 20).
- **Link** — set a URL, bind the link target to a data field, or (for a block repeated over a list of records) link each record to its own detail page — this is what makes a "View details" button work across a whole list of Data Objects.
- **Animation** — a GSAP-based entrance/interaction animation, with a preview-replay button.
- **AI generate snippet / AI generate text** — generates content into or around this specific block (Chapter 8 covers AI-assisted authoring in full).
- **Save as snippet** — turns this block (and everything nested inside it) into a reusable Snippet (Chapter 6).
- **Bind to data object / Bind to gateway endpoint** — connects this block's content to a Data Object record or an external Integration (Chapters 18–20).
- **Delete** — removes the block. Disabled on the document's root, which can't be deleted.

## Styling: the Customize panel

The **Customize** tab in the sidebar is the full style editor for whatever's currently selected, organized into collapsible groups: **layout** (grid/flex behavior, alignment, position), **dimension** (width/height, column span), **spacing** (padding, margin), **typography**, **background and gradient**, **border, rounding, and shadow**, and **animation/transition/transform**. Under the hood these controls are just producing Tailwind CSS classes — you never need to know that to use them, but it explains why the controls are organized as toggles and pickers rather than free-text CSS.

The **Advanced** tab (next to Customize) exposes lower-level settings for the selected block that don't fit the visual controls — for anyone comfortable with raw values, not required for normal page-building.

The **Tree** tab shows the whole page as a nested outline, useful for selecting a deeply nested block that's hard to click precisely on the canvas, or for understanding a layout's structure at a glance.

## Responsive preview

Click **Preview** in the top toolbar to open a full-screen preview of the page, distinct from the admin-dashboard's own Preview sub-tab (Chapter 3) — this one is instant, stays inside the builder, and includes device controls: **Desktop / Tablet / Mobile** width toggles, and **Portrait / Landscape** orientation once a device frame is showing (with the exact pixel dimensions displayed). If the page's URL contains a `{placeholder}` segment (a dynamic path — see the Dynamic Website Paths material in `docs/guides/`), a "Preview as path" field lets you type in a real value to test what that specific record would look like. Press Esc or click Close to return to editing.

## Saving, and the absence of undo

Two things save your work:

- **Autosave** — runs automatically at a set interval (configurable per session via the **Settings** gear in the top toolbar; the starting default comes from your installation's own settings). You'll see a small "saving… / saved [time]" indicator in the top-left of the toolbar.
- **Save** — saves immediately, useful right before you navigate away or hand the page to someone else.

**There is no undo or redo** in the builder — every change (moving a block, deleting one, editing text) takes effect immediately and stays that way. A few features exist specifically to give you a safety net in its place:

- **Save As** duplicates the current page under a new one before you make a risky change, so the original stays untouched.
- **Export** downloads the current document as a JSON file; **Import** loads one back in — a manual snapshot you can keep before a big edit.
- **New** clears the canvas back to an empty page immediately, with no confirmation prompt — be deliberate before clicking it.

Given this, it's worth developing the habit of using **Save As** before a structural change you're not sure about, rather than relying on being able to step backward afterward.

## Keyboard shortcuts

Most shortcuts use **Alt + key** and act on whatever block is currently selected; they only fire when you're not typing in a text field or editing a block's content inline.

| Shortcut | Effect |
| --- | --- |
| `Ctrl/Cmd + C` | Copy the selected block. |
| `Ctrl/Cmd + V` | Paste the copied block. |
| `Alt + C` | Copy the selected block (same as `Ctrl/Cmd + C`). |
| `Alt + V` | Paste the copied block (same as `Ctrl/Cmd + V`). |
| `Alt + D` | Duplicate the selected block in place. |
| `Alt + R` | Remove the selected block. (Disabled on the document root, same as the toolbar's Delete.) |
| `Alt + G` | Copy the selected block's style (CSS/classes and font) — not the block itself, just its look. |
| `Alt + H` | Paste a style previously copied with `Alt + G` onto the selected block. |
| `Alt + N` | Open the full-screen responsive preview (same as clicking **Preview** in the top toolbar). |
| `Alt + 1` | Add a 2-column Grid as a child of the selected container. |
| `Alt + 2` | Add a Flexbox as a child of the selected container. |
| `Alt + 3` | Add a Heading as a child of the selected container. |
| `Alt + 4` | Add a Paragraph as a child of the selected container. |
| `Alt + 5` | Add an Inline Text block as a child of the selected container. |
| `Alt + 6` | Add an Image as a child of the selected container. |
| `Alt + 7` | Add a Button as a child of the selected container. |

The `Alt + 1`–`7` shortcuts only do something when the selected block is itself a container (something that can hold children, like a Flexbox or Grid) — selecting a Paragraph or Image first and pressing one of them has no effect.

A few more Alt shortcuts are reserved for panels that aren't wired up yet in this version of the builder — `Alt + K` (shortcuts help), `Alt + L` (link), `Alt + Z` (customizer), `Alt + A` (animation), `Alt + +` (add element), and `Alt + <` (edit CSS) currently do nothing; use the sidebar tabs and floating-toolbar buttons described above for those instead.

## What's next

**Chapter 6, "Snippets & Kits,"** covers the other side of the "Save as snippet" and "Add to Kit" buttons mentioned above — turning something you've built here into a reusable piece you can drop into other pages.

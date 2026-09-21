# 6. Snippets & Kits

Chapter 5 mentioned two buttons without explaining what happens after you click them: the floating toolbar's **Save as snippet**, and the top toolbar's **Add to Kit**. Both turn something you've built into a reusable piece — this chapter covers saving, updating, organizing, and reusing both, plus one mechanical detail worth knowing upfront: **neither is a live link**. Once you drop a Snippet or a Kit template onto a page, it's an independent copy from that moment on — editing the saved original afterward doesn't change pages that already used it, and editing the copy on a page doesn't change the saved original. Think of both as reusable starting points you stamp down, not something wired together permanently.

## Snippets

A **Snippet** saves whatever block you currently have selected — and everything nested inside it — as one named, reusable piece. Unlike a Kit (below), a Snippet can be as small as a single button or as large as an entire section; there's no minimum or maximum.

### Saving a block as a snippet

Select the block on the canvas, then use the floating toolbar's **Save as snippet** action. A small dialog asks for:

- **Name** — required.
- **Category** — a dropdown seeded from the four built-in Elements categories (Containers, Text, Media, Form) plus any categories your own snippets already use, or **+ New category…** to type a fresh one. Categories are just an organizing label, not a fixed list — invent as many as you need.
- **Icon** — any emoji, picked from a small palette or typed/pasted directly. Purely cosmetic, shown wherever the snippet appears afterward.

If you already have at least one snippet saved, the dialog also offers a choice between **New snippet** and **Update existing** (see below).

### Reusing a snippet on a page

Open the **Snippets** tab in the builder's sidebar — a separate tab from Elements, with its own categories (only the ones your saved snippets actually use, not the built-in element groups). Snippets are grouped into a one-category-open-at-a-time accordion; drag a snippet's chip onto the canvas exactly like dragging a block from Elements.

Hovering a chip reveals a small delete (×) button — this deletes the snippet definition itself, not just an instance of it on the current page. Delete carefully.

### Updating an existing snippet

Two ways to change a snippet you've already saved:

- **From the Dashboard's Snippets list** — open **Snippets** in the sidebar, click a snippet to open it. This opens the exact same builder canvas from Chapter 5, scoped to that one snippet's own content as if it were the whole document. Edit it and click **Save** in the top toolbar — no dialog, no confirmation, it saves straight back to that same snippet.
- **From inside a page you're building** — select the block on canvas, use **Save as snippet** again, choose **Update existing**, and pick which saved snippet to overwrite from the dropdown. This replaces that snippet's stored content (and lets you rename or recategorize it too) with whatever's currently selected on your canvas.

Either way, remember the rule from the top of this chapter: updating a snippet's saved definition never reaches back into pages where a copy of it was already dropped. If you need those pages to reflect the change, you'll need to re-drop the updated snippet onto each of them.

### Managing snippets from the Dashboard

Open **Snippets** in the sidebar for the full list, independent of any one page:

- **List or grid view**, search by name, filter by category.
- **+ New Snippet** opens a fresh builder canvas with nothing in it yet; naming it happens the first time you save (Chapter 5's builder, scoped to a snippet). The tab and the list both update to the real name as soon as that first save completes.
- **Multi-select** for bulk **Export** or **Delete**; **Import** loads snippets back in from a previously exported JSON file — useful for a backup, or for moving snippets between two Whoobe installations.
- Each row also has a **Send as Brevo campaign** shortcut (Chapter 15) and its own **Delete**.

## Kits

A **Kit** is a different, coarser kind of reusable piece: instead of one selected block, **Add to Kit** always packages the **entire document you're currently editing** — a whole page, snippet, or mail template — as one named "template" filed inside a Kit. There's no per-block equivalent of Add to Kit the way there is for Snippets; it only ever captures the whole thing.

A Kit itself is just a named, categorized folder of these templates — think of a Kit as a small collection of full starting-point layouts (a "Landing Pages" kit with three or four variants, say), each one still a complete document you drop in whole.

### Saving into a kit

From the top toolbar, click **Add to Kit**. Choose an existing kit or create a new one (name + category), then give this specific template its own name and category, and confirm. The template's name/category default to whatever the current document is already called, if it has one.

### Browsing and inserting a Kit template

Open the **Kits** tab in the builder's sidebar: an accordion of kits (name and template count), each expandable to show its templates with **Preview** (a read-only look) and **Load** actions. A grid icon next to each kit opens a larger gallery view of the same templates as visual thumbnails, if you'd rather browse that way.

**Select a container on the canvas first** — Load inserts the template inside whatever container is currently selected; picking a non-container, or nothing at all, brings up an alert asking you to select a container instead of silently failing.

### No dashboard-level Kits browser

Unlike Snippets, Kits exist only inside the page builder right now — there's no admin-dashboard sidebar entry or standalone list for managing them. Everything (creating, browsing, loading) happens from within a page's, snippet's, or mail template's own Editor tab. There's also currently no way to delete a kit or remove a template from one through the UI — plan your kit and category names with that in mind.

## What's next

**Chapter 7, "Themes,"** covers the other reusable resource mentioned back in Chapter 4 — a saved set of colors and fonts you can assign to a whole website or to one page at a time.

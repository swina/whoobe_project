# 7. Themes

A **Theme** is a named, reusable set of colors and fonts (plus, optionally, raw CSS for anything the visual controls can't express). This chapter covers defining one, applying it to a whole website, and overriding it for a single page from inside the builder.

## Managing themes

Open **Themes** in the sidebar — its own top-level section, not nested under Settings. The list shows every saved theme with a quick color/font count. **+ New Theme** asks only for a name; everything else is filled in afterward by clicking **Edit** on it:

- **Colors** — any number of named swatches (e.g. `primary`, `accent`, `background`), each a name plus a hex value picked from a color input. The name is what matters: it becomes a color you can pick throughout the page builder's Customize panel (Chapter 5), not just a swatch sitting unused in the theme record.
- **Fonts** — any number of font names, added by typing and pressing Enter/+Add. These are Google Fonts family names; the editor loads them live from Google Fonts, so there's no upload step — just get the name right (case matters).
- **Custom Styles** — a free-text box for raw CSS rules, injected as-is wherever the theme is active. The editor only checks that your braces balance; it doesn't validate the CSS itself.
- **Tailwind Custom Classes** — a space-separated list of Tailwind utility classes you want generated even if no block on the page currently uses them (useful for classes you plan to reference from custom styles or custom JS, which Tailwind would otherwise never generate since it only scans what's actually present in the markup).

Click **Save**. **Delete** removes a theme outright — there's no warning about who's currently using it, so check first if you're not sure.

## Applying a theme to a website

A theme is assigned per **website**, not globally: open the website's own tab (Chapter 4) → **Settings** → the **Theme** dropdown → pick a theme (or "No theme") → **Save**. Every page in that website uses this theme by default.

## Overriding the theme for one page

This is *not* a field in the page's own Settings tab — it lives inside the page's **Editor**, on the **Theme** button in the top toolbar (mentioned in passing back in Chapter 5). Clicking it opens a panel with two distinct layers, and it's worth keeping them straight:

- **Pick a different whole theme for this page.** The top of the panel lists every saved theme; clicking one swaps this page over to it entirely, replacing the website's default just for this one page. This choice is saved with the page itself, not with the theme or the website.
- **Page custom colors / Page fonts.** Below that, you can add colors and fonts that exist *only* on this page, layered on top of whichever theme is active: a custom color with the same name as one in the active theme overrides it (same name, different value, this page only); custom fonts, if you add any, replace the active theme's font list entirely for this page (not merged — it's all-or-nothing on fonts specifically, unlike colors).

Neither of these touches the saved Theme record or any other page — same "independent copy, not a live link" caution as Chapter 6's Snippets and Kits. Note also that the **Custom Styles** and **Tailwind Custom Classes** fields have no per-page equivalent — only colors and fonts can be overridden per page; raw custom CSS always comes from the website-level theme.

## What's next

**Chapter 8, "AI-Assisted Authoring,"** covers the AI Page, AI Image, and Figma Import buttons sitting right next to Theme in that same top toolbar.

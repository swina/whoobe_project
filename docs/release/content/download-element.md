# The Download element

The **Download** element (palette > **Media** > Download) is a button that saves a file: an asset of the library or any URL.

## Adding and configuring it

1. Drag **Download** onto the page and select it.
2. Open **Advanced**: **Download** is the first section. It opens by itself when you select a Download element.
3. **File**: type a library path (`/files/brochure.pdf`) or a URL (`https://...`), or press the folder button to browse the library.
4. **Open in a new tab**: for files the browser shows (a PDF, an image) instead of saving.

The label, icon, colours, size, spacing and animation are those of any button: Custom Classes, Style, the button icon in
the toolbar. Nothing about the look changed.

## What visitors get

On the published site (and in Preview) the element is a link with the `download` attribute, carrying all the button's classes. With **no file chosen** it stays a plain button
that does nothing, and Advanced says so.

## Good to know

- A **private** asset (a folder under `private/`) is not readable by visitors, so the link would not work; Advanced warns when the path is private.
- The file travels with the website: exporting and importing a website carries the asset and rewrites the reference like any other.
- Download elements created before this change had no file: select them and choose one.

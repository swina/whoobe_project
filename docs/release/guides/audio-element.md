# The Audio element

The **Audio** element (palette > **Media** > Audio) puts a sound file on a page. The source is either a file of the
asset library or any URL, and the look is either the browser's own player or a player with the **waveform** of the
track.

## Adding and configuring it

1. Drag **Audio** from the **Media** group of the palette onto the page, and select it.
2. Open **Advanced**: **Audio** is the first section of the list. It opens by itself when you select an Audio element
   and, like the other sections, folds and unfolds from its header (opening another section folds it).
3. **Source**: type a library path (`/audio/song.mp3`) or a URL (`https://...`), or press the folder button to browse
   the library; the browser only lists audio assets. The toolbar's "Browse assets" button does the same.
4. **Look**:
   - **Player**: the browser's audio player (play, position, volume; it looks different in each browser).
   - **Player with waveform**: a round play button, the waveform of the track (the part already played in a second
     colour), and the elapsed / total time. Click or drag on the waveform to move through the track; with the
     keyboard, the arrow keys move by 5 seconds and Space or Enter plays and pauses.
5. **Title**: *Show the file name as title* puts the name of the track above the player, taken from the source: the file
   name without its extension and with spaces restored (`/audio/My%20Song.mp3` shows `My Song`). It is off by default.
   *Cut a long name to one line* (on by default) keeps it on a single line with an ellipsis, the full name being the
   tooltip; switch it off to let a long name wrap. The title also becomes the accessible name of the player.
   *Title style* chooses how the title looks:
   - **default**: a small, medium-weight, slightly faded line; it still takes the **colour** of the element;
   - **same as this element**: no style of its own, so the title takes the font, size, weight, colour and line height
     you give the Audio element in **Advanced > Custom Classes** (for example `text-lg font-bold text-white`);
   - **my own classes**: Tailwind utility classes for the title alone (`text-2xl italic text-emerald-600 mb-3`), applied
     as they are, any class works including arbitrary values. Add a bottom margin (`mb-2`) for the space above the
     player. Markup characters, backslashes and quotes are removed and the list is limited to 300 characters.
6. Options: show the controls (in the waveform look: the time), loop, start automatically, and how much to load
   (nothing until played / the duration only / the whole file). In the waveform look you also choose the two
   colours and the height (16 to 240 px). The element's usual style classes (width, margins, shadows) apply to the
   whole player; the default is full width.

The player works in the editing canvas too, so you can listen to it and check the look while you work. Pressing play
or moving through the track does not deselect the element.

## The waveform, and when it falls back

The waveform is drawn from the audio file itself, which the page therefore has to download and decode once (a file
of a few MB is read in a moment; a 17 MB track of about 18 minutes was drawn in under 3 seconds; files over **40 MB** are
not drawn). When it cannot be done, the visitor gets the
**plain player** instead, so the sound is never lost. That happens when:

- the source is a URL of **another site that does not allow other sites to read the file** (a CORS restriction of
  that site; the browser can *play* such a file but not *read* it to draw it). Files from the asset library, from a
  CDN set up for it, or from your own domain work;
- the browser cannot decode the format.
- the file is **private** and the page is open without a session (a private asset answers only to a logged-in user, with the
  session cookie, and only from an allowed origin).

The reason is written in the browser console (`[AudioPlayer] waveform unavailable, showing the plain player: ...`).

While the waveform is being computed a dimmed placeholder is shown.

## Where it works

| Place | Result |
|---|---|
| Editing canvas, preview, public pages served by the editor application | player or waveform and the title, as configured |
| Mobile-app shell (`publish-mobile.sh`, from 2026-10-08) | the editor's own player, copied into the project: player or waveform and the title, as configured. Projects generated earlier show the plain player: generate them again. The waveform needs the audio file to be readable by the app (same rules as above: CORS, private files) |
| Headless SDK (`@whoobe-cms/react`, `vue`, `svelte`) and the generated Next.js / Nuxt sites | the plain player, no title; the node carries `data-whoobe-audio="waveform"` so a project can draw its own waveform |

Autoplay with sound is blocked by browsers until the visitor has interacted with the page: **Start automatically**
often does nothing on the first load.

## Stored data

The element is `element: "audio"`, with the source in `image.url` (a library path or a URL, like an image) and the
settings in `options` (`mode`: `player` or `waveform`, `controls`, `loop`, `autoplay`, `preload`, `waveColor`,
`progressColor`, `height`, `showTitle`, `truncateTitle`, `titleStyle`: `default`, `inherit` or `custom`, `titleClass`). Colours accept only plain CSS colour syntax; anything else falls back to the default.

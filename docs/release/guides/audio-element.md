# The Audio element

The **Audio** element (palette > **Media** > Audio) puts a sound file on a page. The source is either a file of the
asset library or any URL, and the look is either the browser's own player or a player with the **waveform** of the
track.

## Adding and configuring it

1. Drag **Audio** from the **Media** group of the palette onto the page, and select it.
2. Open **Advanced**: the **Audio** panel is at the bottom.
3. **Source**: type a library path (`/audio/song.mp3`) or a URL (`https://...`), or press the folder button to browse
   the library; the browser only lists audio assets. The toolbar's "Browse assets" button does the same.
4. **Look**:
   - **Player**: the browser's audio player (play, position, volume; it looks different in each browser).
   - **Player with waveform**: a round play button, the waveform of the track (the part already played in a second
     colour), and the elapsed / total time. Click or drag on the waveform to move through the track; with the
     keyboard, the arrow keys move by 5 seconds and Space or Enter plays and pauses.
5. Options: show the controls (in the waveform look: the time), loop, start automatically, and how much to load
   (nothing until played / the duration only / the whole file). In the waveform look you also choose the two
   colours and the height (16 to 240 px). The element's usual style classes (width, margins, shadows) apply to the
   whole player; the default is full width.

The player works in the editing canvas too, so you can listen to it and check the look while you work. Pressing play
or moving through the track does not deselect the element.

## The waveform, and when it falls back

The waveform is drawn from the audio file itself, which the page therefore has to download and decode once (a file
of a few MB is read in a moment; files over **40 MB** are not drawn). When it cannot be done, the visitor gets the
**plain player** instead, so the sound is never lost. That happens when:

- the source is a URL of **another site that does not allow other sites to read the file** (a CORS restriction of
  that site; the browser can *play* such a file but not *read* it to draw it). Files from the asset library, from a
  CDN set up for it, or from your own domain work;
- the browser cannot decode the format.

While the waveform is being computed a dimmed placeholder is shown.

## Where it works

| Place | Result |
|---|---|
| Editing canvas, preview, public pages served by the editor application | player or waveform, as configured |
| Mobile-app shell | the plain player (controls, loop, autoplay, preload); no waveform |
| Headless SDK (`@whoobe-cms/react`, `vue`, `svelte`) and the generated Next.js / Nuxt sites | the plain player; the node carries `data-whoobe-audio="waveform"` so a project can draw its own waveform |

Autoplay with sound is blocked by browsers until the visitor has interacted with the page: **Start automatically**
often does nothing on the first load.

## Stored data

The element is `element: "audio"`, with the source in `image.url` (a library path or a URL, like an image) and the
settings in `options` (`mode`: `player` or `waveform`, `controls`, `loop`, `autoplay`, `preload`, `waveColor`,
`progressColor`, `height`). Colours accept only plain CSS colour syntax; anything else falls back to the default.

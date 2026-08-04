import { registerElementAreabrickConverter, type WhoobeOneElementNode } from '../pimcore-page-converter.js';
import { resolveMediaUrl } from '../pimcore-document-converter.js';

/**
 * Element-targeting counterpart to areabrick-mappings/header-brick.ts -
 * same real Twig template this is reconstructed from (see that file's own
 * extensive header comment for the full derivation: the CSS Grid stacking
 * technique, the fluid-type `clamp()` simplification, the dead
 * `header_color` field, the always-hidden CTA). Not repeated verbatim
 * here - read that file for the "why" behind each Tailwind class; this
 * file only re-derives the *structure* into `Element`'s own shape.
 *
 * One real, honest limitation surfaced porting this, not papered over:
 * apps/whoobe-one-spike's `BlockContainer.vue` always renders a literal
 * `<div>` for every container, regardless of any `tag`/`element` field -
 * there is no way, in the *current* Element/BlockContainer model, to
 * render the semantic `<section>`/`<aside>`/`<header>`/`<hgroup>` tags
 * the real source markup (and the WhoobeBlockNode version of this same
 * brick) uses. The CSS Grid stacking technique itself is unaffected -
 * it's driven entirely by the Tailwind classes below, which apply
 * identically to a `<div>` - only the semantic/accessibility tag names
 * are lost. Flagged here as a real, separate follow-up for whoobe-one-
 * spike's own container model (a `renderTag` field BlockContainer.vue
 * could read), not something this migration-tool package can fix on its
 * own.
 *
 * The CTA ("Scarica schede e folder") is modeled as a plain text node
 * with `link: '#'` set on it - not `element: 'a'` directly - because
 * apps/whoobe-one-spike only ever turns a node into a real `<a href>` by
 * wrapping it from its *parent* container's own dispatch (see
 * preview/BlockContainerPreview.vue's `child.link` check), not by
 * rendering `element: 'a'` as a tag name directly (BlockElement.vue's
 * generic dispatch never binds an `href` attribute at all) - the parent-
 * wrap path is the only one that produces a real, working link in this
 * app today.
 */
registerElementAreabrickConverter('header-brick', (brickIndex, brick, s3Prefix) => {
  const title = brick.fields.header_title?.data ?? '';
  const description = brick.fields.header_text?.data ?? '';
  const imagePath = brick.fields.header_image?.data?.path;
  const videoPath = brick.fields.header_video?.data?.path;

  const idPrefix = `whoobe_header_brick_${brickIndex}`;
  const contentBlocks: WhoobeOneElementNode[] = [];

  if (videoPath) {
    contentBlocks.push({
      id: `${idPrefix}_video_wrap`,
      type: 'container',
      tag: 'flex',
      element: 'div',
      css: {
        css: 'relative overflow-hidden h-full',
        // Same grid cell as the text content block below (col-start-2
        // row-start-1), so they stack: video painted first (DOM order),
        // text overlaid on top - the real technique the source's own
        // global grid + per-component grid-area rule uses, reproduced
        // here with plain Tailwind position-in-grid utilities.
        container: 'col-start-2 row-start-1 self-start justify-self-stretch',
      },
      blocks: [
        {
          id: `${idPrefix}_video`,
          type: 'video',
          tag: 'element',
          element: 'video',
          css: {
            css: 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full max-w-none tablet-p:h-auto tablet-p:w-full',
            container: '',
          },
          src: resolveMediaUrl(videoPath, s3Prefix),
          options: { autoplay: true, loop: true, controls: false },
          blocks: [],
        },
      ],
    });
  }

  contentBlocks.push({
    id: `${idPrefix}_content`,
    type: 'container',
    tag: 'flex',
    element: 'div',
    css: {
      css: 'h-[400px] tablet-l:h-[520px] w-full bg-gradient-to-b from-black/0 to-black/70 pb-[45px]',
      container: 'col-start-2 row-start-1',
    },
    blocks: [
      {
        id: `${idPrefix}_wrapper`,
        type: 'container',
        tag: 'grid',
        element: 'div',
        css: {
          css: 'h-full text-center mx-[5%] desktop-md:mx-[5.6%]',
          container: 'grid tablet-p:grid-cols-[2fr_1fr] tablet-l:grid-cols-[3fr_1fr] desktop-sm:grid-cols-[4fr_1fr]',
        },
        blocks: [
          {
            id: `${idPrefix}_hgroup`,
            type: 'container',
            tag: 'flex',
            element: 'div',
            css: { css: 'text-left self-end justify-self-stretch', container: 'flex flex-col' },
            blocks: [
              {
                id: `${idPrefix}_title`,
                type: 'element',
                tag: 'element',
                element: 'h',
                level: 1,
                content: title,
                editable: true,
                css: {
                  css: 'text-white leading-none tracking-[-0.04em] my-4 font-tenor text-[40px] tablet-l:text-[clamp(40px,calc(40px_+_34*(100vw_-_1024px)/416),74px)] tablet-l:leading-[1.3]',
                  container: '',
                },
                blocks: [],
              },
              {
                id: `${idPrefix}_text`,
                type: 'element',
                tag: 'element',
                element: 'p',
                content: description,
                editable: true,
                css: {
                  css: 'text-white leading-none tracking-[-0.04em] m-0 font-tenor text-[20px] tablet-p:text-[clamp(20px,calc(20px_+_6*(100vw_-_1024px)/416),26px)] tablet-p:leading-[1.3]',
                  container: '',
                },
                blocks: [],
              },
              {
                id: `${idPrefix}_cta`,
                type: 'element',
                tag: 'element',
                element: 'span',
                content: 'Scarica schede e folder',
                editable: true,
                link: '#',
                // The real site hides this unconditionally (`a { display:
                // none }` in the source component's own CSS) - reproduced
                // as `hidden` rather than dropping the node, so the content
                // is preserved for future editing even though it isn't
                // currently visible on the real site either.
                css: { css: 'hidden', container: '' },
                blocks: [],
              },
            ],
          },
        ],
      },
    ],
  });

  return {
    id: idPrefix,
    type: 'container',
    tag: 'grid',
    element: 'div',
    label: 'Header (Hero Generico)',
    css: {
      css: 'relative w-screen h-[400px] tablet-l:h-[520px] bg-cover bg-no-repeat bg-top',
      container: 'grid grid-cols-[auto_minmax(auto,1440px)_auto]',
    },
    style: imagePath ? `background-image:url(${resolveMediaUrl(imagePath, s3Prefix)});` : undefined,
    blocks: contentBlocks,
  };
});

import type { WhoobeBlockNode } from '@pimcore-custom/core';
import { registerAreabrickConverter, resolveMediaUrl } from '../pimcore-document-converter.js';

/**
 * Mirrors the REAL (non-editmode) rendering path of
 * templates/areas/header-brick/view.html.twig, which for actual page
 * output delegates entirely to templates/components/hero-generico.html.twig:
 *
 *   <section class="hero-generico" style="background-image:url(...)">
 *     <aside><video autoplay loop muted playsinline><source .../></video></aside>  (only if header_video is set)
 *     <header><div class="sb-wrapper"><hgroup>
 *       <h1>{header_title}</h1>
 *       <p data-limit="135">{header_text}</p>
 *       <a href="#" class="icon-arrow-download">Scarica schede e folder</a>
 *     </hgroup></div></header>
 *   </section>
 *
 * `cssClass` on every node is Tailwind utility classes, ported by hand from
 * the real assets/scss/components/_hero-generico.scss (plus .sb-wrapper
 * from assets/scss/base/_global.scss) - not the original semantic class
 * names, since the CSS itself isn't shipped/imported here (deliberate
 * choice, see docs/plans/cms/pimcore-areablock-import-plan.md's Preview
 * Styling section). Breakpoint tokens (tablet-l:, tablet-p:, desktop-md:)
 * and font-tenor come from site-theme.css, which mirrors the real
 * _variables.scss/_mediaquery.scss values exactly, so they're not
 * approximations - only the *technique* (utility classes vs
 * grid-area/place-self) differs from the source, not the resulting
 * dimensions/breakpoints.
 *
 * Known simplifications, worth revisiting if this brick's visual output
 * is checked pixel-for-pixel against the live site:
 * - The source uses `grid-area: content` on both `aside` and `header` to
 *   stack the video and text as layers, but `.hero-generico` itself never
 *   declares `display:grid` in this file (likely relies on a rule this
 *   pass didn't chase down, or is vestigial). Reproduced the same visual
 *   *effect* (video as a full-bleed background layer, text overlaid) via
 *   plain absolute positioning instead, which needs no unresolved grid
 *   context to work.
 * - `h1`/`p`'s fluid type (the `fluid-type` mixin, a two-breakpoint linear
 *   interpolation) is collapsed into a single CSS `clamp()` each - clamp's
 *   own min/max bounds reproduce the same flat-below/fluid-between/flat-
 *   above behavior as the mixin's two `@media` blocks did, without needing
 *   the extra breakpoint gate the source had (it becomes redundant once
 *   expressed as clamp).
 * - Line-height's exact per-breakpoint transition (1 -> 1.1em internally
 *   -> 1.3) is simplified to a two-state leading-none/leading-[1.3] toggle
 *   at tablet-l, not a fully fluid transition.
 *
 * Other notes:
 * - The image is a CSS background (via Pimcore's own "THUMBNAIL_GENERICO"
 *   named asset thumbnail preset), never an <img> tag. That preset doesn't
 *   exist in this system, and the underlying asset file itself hasn't been
 *   migrated into this system's S3 bucket yet (a separate, not-yet-built
 *   `migrate-assets` CLI command) - so the resolved path here is a
 *   placeholder reference, same caveat as every other Image editable this
 *   tool converts, not something specific to this brick.
 * - `header_color`, a document-level custom property (not a brick field),
 *   is passed into hero-generico.html.twig's include but the template body
 *   never actually references it - genuinely dead in the source, so it's
 *   intentionally not modeled here.
 * - The CTA link ("Scarica schede e folder", href="#") is static markup in
 *   the source, not driven by any brick field - modeled as a fixed node.
 *   Its own component rule is `a { display: none }`, i.e. the real site
 *   hides it unconditionally - reproduced here as `hidden` rather than
 *   dropping the node, so the content is preserved for future editing even
 *   though it isn't currently visible on the real site either.
 */
registerAreabrickConverter('header-brick', (brickIndex, brick, s3Prefix) => {
  const title = brick.fields.header_title?.data ?? '';
  const description = brick.fields.header_text?.data ?? '';
  const imagePath = brick.fields.header_image?.data?.path;
  const videoPath = brick.fields.header_video?.data?.path;

  const idPrefix = `header_brick_${brickIndex}`;
  const children: WhoobeBlockNode[] = [];

  if (videoPath) {
    children.push({
      id: `${idPrefix}_video_wrap`,
      type: 'container',
      name: 'header_video',
      tag: 'aside',
      props: { cssClass: 'absolute inset-0 overflow-hidden' },
      children: [
        {
          id: `${idPrefix}_video`,
          type: 'media',
          name: 'header_video_element',
          tag: 'video',
          props: {
            src: resolveMediaUrl(videoPath, s3Prefix),
            autoplay: true,
            loop: true,
            muted: true,
            playsinline: true,
            cssClass: 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full max-w-none tablet-p:h-auto tablet-p:w-full',
          },
        },
      ],
    });
  }

  children.push({
    id: `${idPrefix}_content`,
    type: 'container',
    name: 'hero_content',
    tag: 'header',
    props: { cssClass: 'relative h-[400px] tablet-l:h-[520px] w-full bg-gradient-to-b from-black/0 to-black/70 pb-[45px] flex items-end' },
    children: [
      {
        id: `${idPrefix}_wrapper`,
        type: 'container',
        name: 'sb_wrapper',
        tag: 'div',
        props: { cssClass: 'w-full max-w-[1440px] mx-auto px-[5%] desktop-md:px-[5.6%]' },
        children: [
          {
            id: `${idPrefix}_hgroup`,
            type: 'container',
            name: 'hgroup',
            tag: 'hgroup',
            props: { cssClass: 'text-left' },
            children: [
              {
                id: `${idPrefix}_title`,
                type: 'typography',
                name: 'header_title',
                tag: 'h1',
                content: title,
                props: {
                  cssClass:
                    'text-white leading-none tracking-[-0.04em] my-4 font-tenor text-[40px] tablet-l:text-[clamp(40px,calc(40px_+_34*(100vw_-_1024px)/416),74px)] tablet-l:leading-[1.3]',
                },
              },
              {
                id: `${idPrefix}_text`,
                type: 'typography',
                name: 'header_text',
                tag: 'p',
                content: description,
                props: {
                  dataLimit: 135,
                  cssClass:
                    'text-white leading-none tracking-[-0.04em] m-0 font-tenor text-[20px] tablet-p:text-[clamp(20px,calc(20px_+_6*(100vw_-_1024px)/416),26px)] tablet-p:leading-[1.3]',
                },
              },
              {
                id: `${idPrefix}_cta`,
                type: 'typography',
                name: 'cta',
                tag: 'a',
                content: 'Scarica schede e folder',
                props: { href: '#', cssClass: 'hidden' },
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
    name: 'Header (Hero Generico)',
    tag: 'section',
    props: {
      cssClass: 'relative w-screen h-[400px] tablet-l:h-[520px] bg-cover bg-no-repeat bg-top',
      backgroundImageSrc: imagePath ? resolveMediaUrl(imagePath, s3Prefix) : undefined,
    },
    style: imagePath ? { backgroundImage: `url(${resolveMediaUrl(imagePath, s3Prefix)})` } : undefined,
    children,
  };
});

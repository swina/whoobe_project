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
 * `cssClass` on every node is Tailwind utility classes, hand-ported from
 * the real CSS - not the original semantic class names, since the CSS
 * itself isn't shipped/imported here (deliberate choice, see
 * docs/plans/cms/pimcore-areablock-import-plan.md's Preview Styling
 * section). Breakpoint tokens (tablet-l:, tablet-p:, desktop-md:, etc.)
 * and font-tenor come from site-theme.css, which mirrors the real
 * _variables.scss/_mediaquery.scss values exactly.
 *
 * The layering mechanism (revised - see below) is now a faithful port,
 * not an approximation:
 *
 * `.hero-generico` is a `<section>` inside `<main>`, which inherits a
 * GLOBAL rule from assets/scss/base/_global.scss (`main section { display:
 * grid; grid-template-columns: auto minmax(auto,1440px) auto;
 * grid-template-areas: ". content ."; } .sb-wrapper { grid-area: content; }`)
 * - initially missed on the first pass through this file alone, since
 * `.hero-generico` itself never declares `display:grid` and that's easy
 * to read as "this must be approximated." It isn't: both `aside` and
 * `header` in `_hero-generico.scss` set `grid-area: content`, which -
 * combined with the inherited global grid - places them in the SAME
 * grid cell (the middle "content" column), so they stack by DOM order
 * (video painted first, text overlay on top) via ordinary CSS Grid
 * stacking, not absolute positioning. Reproduced here with Tailwind's
 * `col-start-2 row-start-1` on both `aside` and `header`, sharing the
 * outer section's `grid-cols-[auto_minmax(auto,1440px)_auto]` - the
 * actual technique, not a substitute for one.
 *
 * `.sb-wrapper` (from _global.scss, overridden per-component in
 * _hero-generico.scss) is itself a nested grid, `height:100%` of its
 * `header` parent, with responsive `grid-template-columns` (2fr 1fr /
 * 3fr 1fr / 4fr 1fr at increasing breakpoints - only one column is
 * populated by this brick's single `hgroup` child, but the columns are
 * kept for fidelity). `hgroup`'s `place-self: end stretch` (self-align to
 * the bottom of that grid, stretch horizontally) is Tailwind's
 * `self-end justify-self-stretch` - built-in utilities, no arbitrary
 * value needed.
 *
 * Remaining known simplification: `h1`/`p`'s fluid type (the SCSS
 * `fluid-type` mixin, a two-breakpoint linear interpolation) is collapsed
 * into a single CSS `clamp()` each - clamp's own min/max bounds reproduce
 * the same flat-below/fluid-between/flat-above behavior the mixin's two
 * `@media` blocks did, without needing the extra breakpoint gate (it
 * becomes redundant once expressed as clamp). Line-height's exact
 * per-breakpoint transition (1 -> 1.1em internally -> 1.3) is simplified
 * to a two-state leading-none/leading-[1.3] toggle at tablet-l, not a
 * fully fluid transition.
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
      // col-start-2/row-start-1: same grid cell as `header` below, so
      // they stack (video behind, text in front, matching DOM order).
      props: { cssClass: 'col-start-2 row-start-1 relative overflow-hidden h-full self-start justify-self-stretch' },
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
    props: { cssClass: 'col-start-2 row-start-1 h-[400px] tablet-l:h-[520px] w-full bg-gradient-to-b from-black/0 to-black/70 pb-[45px]' },
    children: [
      {
        id: `${idPrefix}_wrapper`,
        type: 'container',
        name: 'sb_wrapper',
        tag: 'div',
        props: {
          cssClass:
            'grid h-full text-center mx-[5%] desktop-md:mx-[5.6%] tablet-p:grid-cols-[2fr_1fr] tablet-l:grid-cols-[3fr_1fr] desktop-sm:grid-cols-[4fr_1fr]',
        },
        children: [
          {
            id: `${idPrefix}_hgroup`,
            type: 'container',
            name: 'hgroup',
            tag: 'hgroup',
            props: { cssClass: 'text-left self-end justify-self-stretch' },
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
      cssClass: 'relative w-screen h-[400px] tablet-l:h-[520px] bg-cover bg-no-repeat bg-top grid grid-cols-[auto_minmax(auto,1440px)_auto]',
      backgroundImageSrc: imagePath ? resolveMediaUrl(imagePath, s3Prefix) : undefined,
    },
    style: imagePath ? { backgroundImage: `url(${resolveMediaUrl(imagePath, s3Prefix)})` } : undefined,
    children,
  };
});

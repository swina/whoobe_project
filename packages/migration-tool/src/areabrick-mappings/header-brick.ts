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
 * Two things worth flagging for whoever maps the next brick:
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
 * - The CTA link ("Scarica schede e folder", href="#") is static markup,
 *   not driven by any brick field - modeled as a fixed node, not derived
 *   from `brick.fields`.
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
    props: { cssClass: 'sb-wrapper' },
    children: [
      {
        id: `${idPrefix}_title`,
        type: 'typography',
        name: 'header_title',
        tag: 'h1',
        content: title,
      },
      {
        id: `${idPrefix}_text`,
        type: 'typography',
        name: 'header_text',
        tag: 'p',
        content: description,
        props: { dataLimit: 135 },
      },
      {
        id: `${idPrefix}_cta`,
        type: 'typography',
        name: 'cta',
        tag: 'a',
        content: 'Scarica schede e folder',
        props: { href: '#', cssClass: 'icon-arrow-download' },
      },
    ],
  });

  return {
    id: idPrefix,
    type: 'container',
    name: 'Header (Hero Generico)',
    tag: 'section',
    props: {
      cssClass: 'hero-generico',
      backgroundImageSrc: imagePath ? resolveMediaUrl(imagePath, s3Prefix) : undefined,
    },
    style: imagePath ? { backgroundImage: `url(${resolveMediaUrl(imagePath, s3Prefix)})` } : undefined,
    children,
  };
});

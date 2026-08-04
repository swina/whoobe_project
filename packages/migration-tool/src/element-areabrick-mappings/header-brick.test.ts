import { describe, it, expect } from 'vitest';
import { PimcorePageConverter } from '../pimcore-page-converter.js';
import type { PimcoreAreablockBrickInstance } from '../pimcore-document-converter.js';
import './header-brick.js';

describe('header-brick Element mapping (Phase 2 retarget of areabrick-mappings/header-brick.ts)', () => {
  const brick: PimcoreAreablockBrickInstance = {
    brickType: 'header-brick',
    fields: {
      header_title: { name: 'header_title', type: 'input', data: 'Area Comunicazione' },
      header_text: { name: 'header_text', type: 'textarea', data: 'La nostra comunicazione...' },
      header_image: { name: 'header_image', type: 'image', data: { path: '/communication/hero.jpg', alt: 'hero' } },
      header_video: { name: 'header_video', type: 'video', data: { path: '/communication/hero.mp4' } },
    },
  };

  it('produces the same visual structure as the WhoobeBlockNode version, in Element shape, with real semantic tags', () => {
    const result = PimcorePageConverter.convertAreablockBrickToElement(0, brick, 'https://cdn.example.com');
    expect(result).not.toBeNull();
    expect(result!.semantic).toBe('section');
    expect(result!.css.container).toContain('grid-cols-[auto_minmax(auto,1440px)_auto]');
    expect(result!.style).toBe('background-image:url(https://cdn.example.com/communication/hero.jpg);');

    const [videoWrap, content] = result!.blocks;
    expect(videoWrap.semantic).toBe('aside');
    expect(videoWrap.css.container).toContain('col-start-2 row-start-1');
    expect(videoWrap.blocks[0].src).toBe('https://cdn.example.com/communication/hero.mp4');
    expect(videoWrap.blocks[0].options?.autoplay).toBe(true);

    expect(content.semantic).toBe('header');
    expect(content.css.container).toContain('col-start-2 row-start-1');
    const wrapper = content.blocks[0];
    expect(wrapper.semantic).toBeUndefined(); // sb_wrapper is a plain div in the real source too
    expect(wrapper.css.container).toContain('grid');
    const hgroup = wrapper.blocks[0];
    expect(hgroup.semantic).toBe('hgroup');
    expect(hgroup.css.css).toContain('self-end');

    const [title, text, cta] = hgroup.blocks;
    expect(title.element).toBe('h');
    expect(title.level).toBe(1);
    expect(title.content).toBe('Area Comunicazione');
    expect(title.css.css).toContain('font-tenor');
    expect(text.element).toBe('p');
    expect(text.content).toBe('La nostra comunicazione...');
    expect(cta.link).toBe('#');
    expect(cta.css.css).toBe('hidden');
  });

  it('omits the video wrap entirely when header_video is not set', () => {
    const noVideoBrick: PimcoreAreablockBrickInstance = {
      brickType: 'header-brick',
      fields: {
        header_title: brick.fields.header_title,
        header_text: brick.fields.header_text,
        header_image: brick.fields.header_image,
      },
    };
    const result = PimcorePageConverter.convertAreablockBrickToElement(0, noVideoBrick, '');
    expect(result!.blocks).toHaveLength(1);
  });

  it('preserves the leading slash with no s3Prefix (the real production case)', () => {
    const result = PimcorePageConverter.convertAreablockBrickToElement(0, brick, '');
    expect(result!.style).toBe('background-image:url(/communication/hero.jpg);');
  });

  it('containers still carry a plain `element: "div"` alongside their real `semantic` tag', () => {
    // For a *container*, `element` itself is inert - whoobe-one-spike's
    // BlockContainer.vue/BlockSlider.vue only ever read `semantic` (falling
    // back to 'div') to decide the real rendered tag, never `element`.
    // Kept here anyway for consistency with every other Element this
    // converter produces (leaf nodes' `element` IS load-bearing, read
    // directly by BlockElement.vue), not because a container's own
    // `element` value does anything.
    const result = PimcorePageConverter.convertAreablockBrickToElement(0, brick, '');
    expect(result!.element).toBe('div');
    expect([result, ...result!.blocks].every((n) => n!.element === 'div' || n!.blocks.length === 0)).toBe(true);
  });
});

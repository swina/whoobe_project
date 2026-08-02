import { describe, it, expect } from 'vitest';
import { PimcoreDocumentConverter } from '../pimcore-document-converter.js';
import type { PimcoreAreablockBrickInstance } from '../pimcore-document-converter.js';
import './header-brick.js';

describe('header-brick mapping (mirrors templates/areas/header-brick/view.html.twig)', () => {
  const brick: PimcoreAreablockBrickInstance = {
    brickType: 'header-brick',
    fields: {
      header_title: { name: 'header_title', type: 'input', data: 'Area Comunicazione' },
      header_text: { name: 'header_text', type: 'textarea', data: 'La nostra comunicazione...' },
      header_image: { name: 'header_image', type: 'image', data: { path: '/communication/hero.jpg', alt: 'hero' } },
      header_video: { name: 'header_video', type: 'video', data: { path: '/communication/hero.mp4' } },
    },
  };

  it('produces a hero-generico section with background image, video aside, and text group', () => {
    const result = PimcoreDocumentConverter.convertAreablockBrick(0, brick, 'https://cdn.example.com');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('section');
    expect(result!.props?.cssClass).toBe('hero-generico');
    expect(result!.style?.backgroundImage).toBe('url(https://cdn.example.com/communication/hero.jpg)');

    const [videoWrap, content] = result!.children!;
    expect(videoWrap.tag).toBe('aside');
    expect(videoWrap.children![0].props?.src).toBe('https://cdn.example.com/communication/hero.mp4');
    expect(videoWrap.children![0].props?.autoplay).toBe(true);

    expect(content.tag).toBe('header');
    const [title, text, cta] = content.children!;
    expect(title.tag).toBe('h1');
    expect(title.content).toBe('Area Comunicazione');
    expect(text.tag).toBe('p');
    expect(text.content).toBe('La nostra comunicazione...');
    expect(cta.tag).toBe('a');
    expect(cta.props?.href).toBe('#');
  });

  it('omits the video aside entirely when header_video is not set', () => {
    const noVideoBrick: PimcoreAreablockBrickInstance = {
      brickType: 'header-brick',
      fields: {
        header_title: brick.fields.header_title,
        header_text: brick.fields.header_text,
        header_image: brick.fields.header_image,
      },
    };

    const result = PimcoreDocumentConverter.convertAreablockBrick(0, noVideoBrick, '');
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].tag).toBe('header');
  });
});

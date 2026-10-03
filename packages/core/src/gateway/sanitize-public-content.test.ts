import { describe, expect, it } from 'vitest';
import { sanitizePublicGatewayContent } from './sanitize-public-content.js';

const node = (content: string, extra: Record<string, unknown> = {}): any => ({ id: 'n', type: 'element', element: 'p', content, blocks: [], ...extra });

describe('sanitizePublicGatewayContent - rich text', () => {
  it('strips executable markup from element content at any depth, without touching the caller\'s copy', () => {
    const page: any = { page: { content: { id: 'r', type: 'container', blocks: [node('<img src=x onerror=alert(1)>hi <b>there</b>'), { id: 'c', type: 'container', blocks: [node('<script>alert(1)</script>ok')] }] } } };
    const out = sanitizePublicGatewayContent(page) as any;
    expect(out.page.content.blocks[0].content).toBe('<img src="x" />hi <b>there</b>');
    expect(out.page.content.blocks[1].blocks[0].content).toBe('ok');
    expect(page.page.content.blocks[0].content).toContain('onerror');
  });

  it('uses the SVG profile for svg elements and leaves non-node `content` fields alone', () => {
    const out = sanitizePublicGatewayContent({ blocks: [node('<svg viewBox="0 0 1 1" onload="x()"><path d="M0 0"/></svg>', { element: 'svg' })], seo: { content: '<b>kept as is</b>' } }) as any;
    expect(out.blocks[0].content).toContain('<path d="M0 0"');
    expect(out.blocks[0].content).not.toContain('onload');
    expect(out.seo.content).toBe('<b>kept as is</b>');
  });

  it('keeps formatting that authors legitimately use', () => {
    const out = sanitizePublicGatewayContent({ blocks: [node('Line one<br><a href="/about" target="_blank">About</a> <i>x</i>')] }) as any;
    expect(out.blocks[0].content).toBe('Line one<br />' + '<a href="/about" target="_blank" rel="noopener noreferrer">About</a> <i>x</i>');
  });
});

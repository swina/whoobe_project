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

describe('sanitizePublicGatewayContent - Markdown element', () => {
  const md = (content: string, css = 'space-y-3') => ({ id: 'm', type: 'element', element: 'div', tag: 'markdown', editable: true, css: { css, container: '' }, blocks: [], content });
  const page = (node: unknown) => ({ id: 'root', type: 'container', element: 'div', tag: 'document', blocks: [node] });

  it('converts the Markdown source to HTML and turns the node into an ordinary element', () => {
    const out = sanitizePublicGatewayContent(page(md('# Title\n\nSome **bold** and *italic* text with [a link](https://example.com).\n\n- one\n- two\n\n> quoted'))) as any;
    const node = out.blocks[0];
    expect(node.tag).toBe('element');
    expect(node.css.css).toBe('space-y-3');
    expect(node.content).toContain('<h1>Title</h1>');
    expect(node.content).toContain('<strong>bold</strong>');
    expect(node.content).toContain('<em>italic</em>');
    expect(node.content).toContain('<a href="https://example.com">a link</a>');
    expect(node.content).toContain('<li>one</li>');
    expect(node.content).toContain('<blockquote>');
  });

  it('keeps the caller\'s copy as Markdown (the editor needs the source)', () => {
    const original = page(md('# Keep me'));
    sanitizePublicGatewayContent(original);
    expect((original.blocks[0] as any).tag).toBe('markdown');
    expect((original.blocks[0] as any).content).toBe('# Keep me');
  });

  it('is sanitized after the conversion: no script, handler or javascript: link survives, formatting does', () => {
    const hostile = '# Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[click](javascript:alert(3))\n\n<iframe src="https://evil.example"></iframe>\n\n**still bold**';
    const html = (sanitizePublicGatewayContent(page(md(hostile))) as any).blocks[0].content as string;
    expect(html).not.toMatch(/<script|onerror|javascript:|<iframe/i);
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('<strong>still bold</strong>');
  });

  it('handles tables, code and an empty source without throwing', () => {
    const out = sanitizePublicGatewayContent(page(md('| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1\n```'))) as any;
    expect(out.blocks[0].content).toContain('<table>');
    expect(out.blocks[0].content).toContain('<code');
    expect((sanitizePublicGatewayContent(page(md(''))) as any).blocks[0].content).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { escapeHtml, highlightSearchSnippet } from './search-highlight.js';

describe('highlightSearchSnippet', () => {
  it('turns the server <em> markers into the given mark tag', () => {
    expect(highlightSearchSnippet('a <em>b</em> c', '<mark class="x">')).toBe('a <mark class="x">b</mark> c');
  });

  it('escapes any other markup so it cannot execute', () => {
    const out = highlightSearchSnippet('zz <img src=x onerror=alert(1)> <em>hit</em> <script>alert(2)</script>');
    expect(out).not.toMatch(/<img|<script/i);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).toContain('<mark>hit</mark>');
  });

  it('does not let attribute payloads break out of quotes', () => {
    expect(highlightSearchSnippet('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
  });

  it('handles empty input', () => {
    expect(highlightSearchSnippet(undefined)).toBe('');
    expect(escapeHtml('&<>')).toBe('&amp;&lt;&gt;');
  });
});

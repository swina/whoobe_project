// Static documentation site (docs/plans/docs-sites/docs-site-plan.md section 9): HTML for each page of a documentation
// website, one CSS, a small vanilla script and the search index. No framework, no runtime dependency on the CMS: the
// output is a folder to put behind any web server.
//
// Everything is read from the PUBLIC API (so only public documents are published), through the same pipeline the live
// site uses; this file only lays the pages out.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE_PATH_RE = /^\/[A-Za-z0-9._~\-/]*$/

export interface DocsGenerateOptions {
  apiUrl: string
  websiteId: string
  outDir: string
  /** Path the site is served under ("/docs"); default "/". */
  basePath?: string
  /** Public address of the site ("https://docs.example.com"), for the sitemap and canonical links. */
  siteUrl?: string
  /** Where the images and files of the documents are read from; default: the API URL. */
  assetBaseUrl?: string
  /** Copy the files the documents use into the output (default) instead of linking to the CMS. */
  copyAssets?: boolean
  /** Fail when a document has a broken link. */
  strict?: boolean
  fetchImpl?: typeof fetch
  log?: (message: string) => void
}

type NavNode =
  | { type: 'doc'; title: string; path: string; route: string }
  | { type: 'section'; title: string; items: NavNode[]; path?: string; route?: string }
  | { type: 'link'; title: string; href: string }

interface PageData {
  title: string
  description: string | null
  html: string
  headings: { depth: number; text: string; id: string }[]
  breadcrumbs: { title: string; route?: string }[]
  prev: { title: string; route: string } | null
  next: { title: string; route: string } | null
  route: string
  path: string
  updatedAt: string | null
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** "/guide/install" -> "guide/install/", "/" -> "" (the folder of the page, relative to the base path). */
export const routeDir = (route: string): string => {
  const parts = route.split('/').filter(Boolean)
  return parts.length ? parts.join('/') + '/' : ''
}

export function flattenPages(nav: NavNode[]): { title: string; route: string }[] {
  const out: { title: string; route: string }[] = []
  const walk = (list: NavNode[]): void => {
    for (const n of list) {
      if (n.type === 'doc') out.push({ title: n.title, route: n.route })
      else if (n.type === 'section') { if (n.route) out.push({ title: n.title, route: n.route }); walk(n.items) }
    }
  }
  walk(nav)
  return out
}

function navHtml(items: NavNode[], current: string, base: string): string {
  const li = items.map((n) => {
    if (n.type === 'link') return `<li><a href="${esc(n.href)}" rel="noopener noreferrer" target="_blank">${esc(n.title)} ↗</a></li>`
    if (n.type === 'doc') return `<li><a href="${esc(base + routeDir(n.route))}"${n.route === current ? ' aria-current="page"' : ''}>${esc(n.title)}</a></li>`
    const head = n.route
      ? `<a class="sec" href="${esc(base + routeDir(n.route))}"${n.route === current ? ' aria-current="page"' : ''}>${esc(n.title)}</a>`
      : `<span class="sec">${esc(n.title)}</span>`
    return `<li>${head}${navHtml(n.items, current, base)}</li>`
  })
  return `<ul>${li.join('')}</ul>`
}

export interface Theme { accent?: string }

/** Rewrites what the pipeline wrote for the live site into addresses of the static one. */
export function rewritePageHtml(html: string, base: string, assetUrl: (damPath: string) => string): string {
  return html
    // addresses inside the site: marked data-doc, written "/guide/install#x"
    .replace(/<a href="([^"]*)"([^>]*?) data-doc="1"/g, (_m, href: string, rest: string) => {
      const [path, hash] = href.split('#')
      return `<a href="${base}${routeDir(path.replace(/&amp;/g, '&'))}${hash ? '#' + hash : ''}"${rest}`
    })
    // files of the documents
    .replace(/(src|href)="(\/dam-asset\/[^"]+)"/g, (_m, attr: string, url: string) => `${attr}="${assetUrl(url)}"`)
}

export function pageHtml(p: {
  site: string; page: PageData | null; html: string; nav: NavNode[]; base: string; siteUrl?: string; accent?: string; hasCode: boolean; hasMermaid?: boolean; notFound?: boolean
}): string {
  const { page, base } = p
  const title = p.notFound ? 'Page not found' : (page as PageData).title
  const desc = page?.description ? `<meta name="description" content="${esc(page.description)}">` : ''
  const canonical = p.siteUrl && page ? `<link rel="canonical" href="${esc(p.siteUrl.replace(/\/$/, '') + base + routeDir(page.route))}">` : ''
  const crumbs = page && page.breadcrumbs.length > 1
    ? `<nav class="crumbs" aria-label="Breadcrumb">${page.breadcrumbs.map((b, i) => (i < page.breadcrumbs.length - 1 && b.route ? `<a href="${esc(base + routeDir(b.route))}">${esc(b.title)}</a>` : `<span>${esc(b.title)}</span>`)).join(' <i>/</i> ')}</nav>`
    : ''
  const toc = page && page.headings.length
    ? `<aside id="toc" aria-label="On this page"><div class="toc-title">On this page</div><ul>${page.headings.map((h) => `<li class="d${h.depth}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')}</ul></aside>`
    : ''
  const pn = page
    ? `<div class="prevnext">${page.prev ? `<a rel="prev" href="${esc(base + routeDir(page.prev.route))}">← ${esc(page.prev.title)}</a>` : '<span></span>'}${page.next ? `<a rel="next" href="${esc(base + routeDir(page.next.route))}">${esc(page.next.title)} →</a>` : ''}</div>`
    : ''
  const updated = page?.updatedAt ? `<p class="updated">Last updated <time datetime="${esc(page.updatedAt)}">${esc(page.updatedAt.slice(0, 10))}</time></p>` : ''
  const body = p.notFound
    ? `<h1>Page not found</h1><p>The page you are looking for does not exist. <a href="${esc(base)}">Go to the start page</a> or use the search.</p>`
    : `<div class="doc-content">${p.html}</div>`
  const accent = p.accent ? `<style>:root:root{--accent:${esc(p.accent)}}</style>` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${esc(p.site)}</title>
${desc}
${canonical}
<script>try{var t=localStorage.getItem('docs-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="stylesheet" href="${esc(base)}assets/docs.css">
${accent}
</head>
<body data-base="${esc(base)}" data-code="${p.hasCode ? '1' : '0'}" data-mermaid="${p.hasMermaid ? '1' : '0'}">
<header class="top">
  <button id="menu" type="button" aria-label="Menu" aria-controls="nav">☰</button>
  <a class="brand" href="${esc(base)}">${esc(p.site)}</a>
  <div class="search">
    <input id="q" type="search" placeholder="Search the documentation…  (Ctrl K)" aria-label="Search the documentation" autocomplete="off">
    <div id="results" role="listbox" hidden></div>
  </div>
  <button id="theme" type="button" aria-label="Switch between light and dark theme" title="Switch between light and dark theme"></button>
</header>
<div class="shell">
  <aside id="nav" aria-label="Documentation index">${navHtml(p.nav, page?.route ?? '', base)}</aside>
  <main><article>${crumbs}${body}${pn}${updated}</article></main>
  ${toc}
</div>
<script src="${esc(base)}assets/minisearch.js" defer></script>
<script src="${esc(base)}assets/docs.js" defer></script>
</body>
</html>
`
}

export const DOCS_CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:4.5rem}
:root{--accent:#4f46e5;--bg:#fff;--fg:#1f2937;--muted:#6b7280;--line:#e5e7eb;--soft:#f9fafb;--code:#0f172a;--codefg:#e2e8f0}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f1115;--fg:#e2e8f0;--muted:#94a3b8;--line:#232733;--soft:#161a22;--accent:#818cf8;--code:#0b0d12;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f1115;--fg:#e2e8f0;--muted:#94a3b8;--line:#232733;--soft:#161a22;--accent:#818cf8;--code:#0b0d12;color-scheme:dark}
:root[data-theme=light]{color-scheme:light}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:1rem;height:3.5rem;padding:0 1rem;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.brand{font-weight:700;color:var(--fg);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#theme{flex:none;width:2.1rem;height:2.1rem;border:1px solid var(--line);border-radius:.5rem;background:var(--soft);color:var(--fg);font-size:1rem;line-height:1;cursor:pointer}#theme:hover{border-color:var(--accent)}
#menu{display:none;background:none;border:0;font-size:1.3rem;color:var(--fg);cursor:pointer}
.search{margin-left:auto;position:relative;width:100%;max-width:24rem}
#q{width:100%;padding:.4rem .75rem;border:1px solid var(--line);border-radius:.5rem;background:var(--soft);color:var(--fg);font:inherit;font-size:.9rem;outline:0}
#q:focus{border-color:var(--accent);background:var(--bg)}
#results{position:absolute;left:0;right:0;top:100%;margin-top:.25rem;max-height:70vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:.5rem;box-shadow:0 10px 30px rgba(0,0,0,.18)}
#results a{display:block;padding:.5rem .75rem;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg)}
#results a:last-child{border:0}#results a[aria-selected=true],#results a:hover{background:var(--soft)}
#results .t{font-size:.9rem;font-weight:600}#results .t em{font-style:normal;font-weight:400;color:var(--muted)}
#results .b,#results .x{font-size:.75rem;color:var(--muted)}#results .none{padding:.75rem;color:var(--muted);font-size:.9rem}
.shell{display:flex;gap:2rem;max-width:100rem;margin:0 auto;padding:0 1rem}
#nav{width:14rem;flex:none;position:sticky;top:3.5rem;align-self:flex-start;max-height:calc(100vh - 3.5rem);overflow:auto;padding:1.25rem 0;font-size:.82rem}
#nav ul{list-style:none;margin:0;padding:0}#nav ul ul{margin-left:.75rem;padding-left:.5rem;border-left:1px solid var(--line)}
#nav a,#nav .sec{display:block;padding:.2rem .5rem;border-radius:.3rem;color:var(--muted);text-decoration:none;line-height:1.35}
#nav .sec{font-weight:600;color:var(--fg)}#nav a:hover{background:var(--soft)}
#nav a[aria-current=page]{color:var(--accent);background:var(--soft);font-weight:600}
main{flex:1;min-width:0;padding:2rem 0}article{max-width:62rem}
#toc{width:12rem;flex:none;position:sticky;top:3.5rem;align-self:flex-start;max-height:calc(100vh - 3.5rem);overflow:auto;padding:2rem 0;font-size:.8rem}
.toc-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.4rem}
#toc ul{list-style:none;margin:0;padding:0}#toc li.d3{margin-left:.75rem}#toc a{display:block;padding:.12rem 0;color:var(--muted);text-decoration:none;line-height:1.35}
#toc a:hover{color:var(--fg)}#toc a.on{color:var(--accent);font-weight:600}
.crumbs{font-size:.78rem;color:var(--muted);margin-bottom:1rem}.crumbs a{color:var(--muted)}.crumbs i{font-style:normal;opacity:.6}
.doc-content h1,.doc-content h2,.doc-content h3,.doc-content h4{overflow-wrap:anywhere}
.doc-content h1{font-size:2rem;line-height:1.2;margin:0 0 1rem}
.doc-content h2{font-size:1.5rem;margin:2.2rem 0 .75rem;padding-top:.5rem;border-top:1px solid var(--line)}
.doc-content h3{font-size:1.2rem;margin:1.6rem 0 .5rem}.doc-content h4{margin:1.2rem 0 .4rem}
.doc-content p,.doc-content ul,.doc-content ol,.doc-content pre,.doc-content table,.doc-content blockquote,.doc-content .doc-admonition{margin:0 0 1rem}
.doc-content ul{list-style:disc;padding-left:1.5rem}.doc-content ol{padding-left:1.5rem}.doc-content li>ul,.doc-content li>ol{margin:.25rem 0 0}
.doc-anchor{margin-left:.5rem;color:var(--muted);text-decoration:none;opacity:0;font-weight:400}h1:hover .doc-anchor,h2:hover .doc-anchor,h3:hover .doc-anchor,h4:hover .doc-anchor{opacity:1}
.doc-content pre{position:relative;background:var(--code);color:var(--codefg);padding:1rem;border-radius:.6rem;overflow-x:auto;font-size:.85rem;line-height:1.55}
.doc-content pre code.hljs{padding:0;background:none}
.doc-content .doc-mermaid{margin:0 0 1rem;overflow-x:auto;text-align:center}.doc-content .doc-mermaid svg{max-width:100%;height:auto}.doc-content .doc-mermaid-error{font-size:.8rem;color:var(--muted);margin:0 0 .3rem}
.doc-content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em}
.doc-content :not(pre)>code{background:var(--soft);border:1px solid var(--line);padding:.05rem .35rem;border-radius:.3rem;overflow-wrap:anywhere}
.copy{position:absolute;top:.4rem;right:.4rem;font:inherit;font-size:.7rem;padding:.15rem .5rem;border-radius:.3rem;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer;opacity:0}
pre:hover .copy,.copy:focus{opacity:1}
.doc-content table{border-collapse:collapse;display:block;overflow-x:auto}.doc-content th,.doc-content td{border:1px solid var(--line);padding:.4rem .75rem;text-align:left}.doc-content th{background:var(--soft)}
.doc-content blockquote{border-left:4px solid var(--line);padding-left:1rem;color:var(--muted)}
.doc-content img{max-width:100%;height:auto;border-radius:.4rem}
.doc-content img.doc-img-left,.doc-content img.doc-img-center,.doc-content img.doc-img-right{display:block}
.doc-content img.doc-img-center{margin:1rem auto}.doc-content img.doc-img-right{margin:1rem 0 1rem auto}.doc-content img.doc-img-left{margin:1rem auto 1rem 0}
.doc-content img.doc-img-float-left{float:left;margin:.25rem 1.25rem 1rem 0}.doc-content img.doc-img-float-right{float:right;margin:.25rem 0 1rem 1.25rem}
.doc-content h1,.doc-content h2,.doc-content h3,.doc-content pre,.doc-content table{clear:both}.doc-content hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.doc-admonition{border-left:4px solid var(--accent);background:var(--soft);padding:.75rem 1rem;border-radius:.5rem}
.doc-admonition-tip{border-color:#10b981}.doc-admonition-warning{border-color:#f59e0b}.doc-admonition-danger{border-color:#ef4444}
.doc-admonition-title{font-weight:700;margin:0 0 .25rem}.doc-admonition>:last-child{margin-bottom:0}
.prevnext{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.9rem}
.updated{margin-top:1rem;font-size:.75rem;color:var(--muted)}
@media (max-width:1100px){#toc{display:none}}
@media (max-width:768px){#menu{display:block}#nav{display:none;position:fixed;inset:3.5rem 0 0 0;width:auto;max-height:none;background:var(--bg);padding:1rem;z-index:10}body.menu-open #nav{display:block}.shell{gap:0}}
@media print{.top,#nav,#toc,.prevnext,.copy{display:none}.shell{display:block}}
`

export const DOCS_JS = `(function () {
  'use strict';
  var base = document.body.getAttribute('data-base') || '/';
  var q = document.getElementById('q'), box = document.getElementById('results');
  document.getElementById('menu').addEventListener('click', function () { document.body.classList.toggle('menu-open'); });

  // light / dark: follows the system until the reader picks one; the choice is kept in this browser (the head script applies it before the first paint)
  var root = document.documentElement, themeBtn = document.getElementById('theme');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function paintTheme() { themeBtn.textContent = isDark() ? '\u2600' : '\u263E'; themeBtn.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); }
  var onTheme = null;
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('docs-theme', next); } catch (e) {}
    paintTheme();
    if (onTheme) onTheme();
  });
  paintTheme();

  // copy buttons on code blocks
  document.querySelectorAll('.doc-content pre').forEach(function (pre) {
    if (pre.querySelector('code.language-mermaid')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'copy'; b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var code = pre.querySelector('code'); var text = (code || pre).textContent || '';
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { b.textContent = 'Press Ctrl C'; });
      setTimeout(function () { b.textContent = 'Copy'; }, 1500);
    });
    pre.appendChild(b);
  });

  // syntax highlighting: the library is loaded only on pages that have code
  if (document.body.getAttribute('data-code') === '1' && document.querySelector('pre code[class*="language-"]:not(.language-mermaid)')) {
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'assets/hljs/theme.css'; document.head.appendChild(css);
    var s = document.createElement('script'); s.src = base + 'assets/hljs/highlight.min.js';
    s.onload = function () { if (window.hljs) document.querySelectorAll('pre code[class*="language-"]:not(.language-mermaid)').forEach(function (el) { window.hljs.highlightElement(el); }); };
    document.head.appendChild(s);
  }

  // diagrams: a code block written as mermaid is drawn as a picture; the library is loaded only on pages that have one, and if it
  // cannot be loaded or a diagram does not parse, the code stays where it was
  if (document.body.getAttribute('data-mermaid') === '1' && document.querySelector('pre code.language-mermaid')) {
    var ms = document.createElement('script'); ms.src = base + 'assets/mermaid/mermaid.min.js';
    ms.onload = function () {
      if (!window.mermaid) return;
      function init() { window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default' }); }
      init();
      var chain = Promise.resolve();
      document.querySelectorAll('pre code.language-mermaid').forEach(function (code, i) {
        chain = chain.then(function () {
          var pre = code.parentNode, src = code.textContent || '';
          return window.mermaid.render('doc-mermaid-' + i, src).then(function (r) {
            var d = document.createElement('div'); d.className = 'doc-mermaid'; d.setAttribute('data-src', src); d.innerHTML = r.svg; pre.replaceWith(d);
          }).catch(function () {
            var n = document.createElement('p'); n.className = 'doc-mermaid-error'; n.textContent = 'This diagram could not be drawn.'; pre.parentNode.insertBefore(n, pre);
            var junk = document.getElementById('ddoc-mermaid-' + i); if (junk) junk.remove();
          });
        });
      });
      // the colours of a drawn diagram are fixed in the picture: draw it again when the theme changes
      onTheme = function () {
        init();
        chain = chain.then(function () {
          var boxes = Array.prototype.slice.call(document.querySelectorAll('.doc-mermaid[data-src]'));
          return boxes.reduce(function (p, d, i) {
            return p.then(function () {
              return window.mermaid.render('doc-mermaid-t' + Date.now() + '-' + i, d.getAttribute('data-src')).then(function (r) { d.innerHTML = r.svg; }).catch(function () {});
            });
          }, Promise.resolve());
        });
      };
    };
    document.head.appendChild(ms);
  }

  // "on this page": the heading being read
  var links = document.querySelectorAll('#toc a');
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {}; links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove('on'); }); var a = byId[e.target.id]; if (a) a.classList.add('on'); } });
    }, { rootMargin: '-60px 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }

  // search: the index is downloaded on the first focus and searched here (same options as the server that built it)
  function norm(t) { return t.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, ''); }
  var OPTIONS = {
    idField: 'id', fields: ['title', 'headings', 'description', 'text'], storeFields: ['title', 'page', 'breadcrumb', 'excerpt'],
    processTerm: function (t) { var n = norm(t); return n.length ? n : null; },
    searchOptions: { boost: { title: 6, headings: 3, description: 2 }, prefix: true, fuzzy: function (t) { return t.length > 4 ? 0.2 : false; }, combineWith: 'AND' }
  };
  var index = null, loading = null, active = 0, shown = [];
  function load() {
    if (index || loading || !window.MiniSearch) return loading;
    loading = fetch(base + 'assets/search-index.json').then(function (r) { if (!r.ok) throw new Error('index'); return r.text(); })
      .then(function (t) { index = window.MiniSearch.loadJSON(t, OPTIONS); run(); }).catch(function () { box.hidden = false; box.textContent = 'Search is not available.'; });
    return loading;
  }
  function url(r) { var id = String(r.id), i = id.indexOf('#'); var route = i < 0 ? id : id.slice(0, i); var dir = route.split('/').filter(Boolean).join('/'); return base + (dir ? dir + '/' : '') + (i < 0 ? '' : id.slice(i)); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function paint(sel) {
    active = sel; Array.prototype.forEach.call(box.querySelectorAll('a'), function (a, i) { a.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
  }
  function run() {
    var text = q.value.trim(); box.textContent = '';
    if (!text || !index) { box.hidden = true; shown = []; return; }
    shown = index.search(text).slice(0, 12); box.hidden = false;
    if (!shown.length) { box.appendChild(el('div', 'none', 'No results for “' + text + '”.')); return; }
    shown.forEach(function (r, i) {
      var a = el('a'); a.href = url(r); a.setAttribute('role', 'option');
      var t = el('div', 't'); if (r.page) { t.appendChild(el('em', '', r.page + ' › ')); } t.appendChild(document.createTextNode(r.title)); a.appendChild(t);
      if (r.breadcrumb) a.appendChild(el('div', 'b', r.breadcrumb));
      if (r.excerpt && !r.page) a.appendChild(el('div', 'x', r.excerpt));
      a.addEventListener('mouseenter', function () { paint(i); });
      box.appendChild(a);
    });
    paint(0);
  }
  q.addEventListener('focus', load);
  q.addEventListener('input', function () { load(); run(); });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); paint((active + 1) % shown.length); }
    else if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); paint((active - 1 + shown.length) % shown.length); }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); window.location.href = url(shown[active]); }
    else if (e.key === 'Escape') { box.hidden = true; q.blur(); }
  });
  q.addEventListener('blur', function () { setTimeout(function () { box.hidden = true; }, 150); });
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); } });
})();
`

/** Folder of an installed package, looked up the way node does (node_modules from this file upwards); some packages export nothing to require. */
function packageRoot(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error(`Cannot find the installed package ${name}`)
}

function assertOptions(o: DocsGenerateOptions): void {
  const url = (name: string, v: string) => { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || /['"`\\<>\s]/.test(v)) throw new Error() } catch { throw new Error(`Invalid ${name}: must be an http(s) URL without quotes, backslashes, angle brackets or whitespace`) } }
  url('apiUrl', o.apiUrl)
  if (o.assetBaseUrl) url('assetBaseUrl', o.assetBaseUrl)
  if (o.siteUrl) url('siteUrl', o.siteUrl)
  if (!UUID_RE.test(o.websiteId)) throw new Error('Invalid websiteId: expected a UUID')
  if (o.basePath && !BASE_PATH_RE.test(o.basePath)) throw new Error('Invalid basePath: expected a path such as /docs (letters, digits, . _ ~ - /)')
}

const normalizeBase = (b?: string): string => { const t = (b ?? '/').replace(/\/+$/, ''); return t === '' ? '/' : t + '/' }

export async function generateDocsSite(raw: DocsGenerateOptions): Promise<{ pages: number; files: number; warnings: string[] }> {
  assertOptions(raw)
  const log = raw.log ?? ((m: string) => console.log(m))
  const doFetch = raw.fetchImpl ?? fetch
  const api = raw.apiUrl.replace(/\/+$/, '')
  const assetBase = (raw.assetBaseUrl ?? raw.apiUrl).replace(/\/+$/, '')
  const base = normalizeBase(raw.basePath)
  const warnings: string[] = []
  const id = encodeURIComponent(raw.websiteId)

  const getJson = async (path: string): Promise<any> => {
    const res = await doFetch(`${api}${path}`)
    if (!res.ok) {
      let msg = `${res.status}`
      try { const b = await res.json() as { error?: string }; if (b?.error) msg = `${res.status} ${b.error}` } catch { /* generic */ }
      throw new Error(`${path}: ${msg}`)
    }
    return res.json()
  }

  log('Reading the index ...')
  const navBody = await getJson(`/public/docs/${id}/nav`) as { title: string; nav: NavNode[] }
  const site = navBody.title
  const pagesList = flattenPages(navBody.nav)
  if (!pagesList.some((p) => p.route === '/')) pagesList.unshift({ title: 'Home', route: '' })   // the home page, if the index does not list it
  log(`${pagesList.length} page(s) in the index.`)

  const pages: { route: string; data: PageData }[] = []
  const seen = new Set<string>()
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= pagesList.length) return
      const item = pagesList[i]
      const key = item.route === '' ? '/' : item.route
      if (seen.has(key)) continue
      seen.add(key)
      try {
        const body = await getJson(`/public/docs/${id}/page/${item.route.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`) as { page: PageData }
        pages.push({ route: key, data: body.page })
      } catch (e) {
        if (item.route === '') continue            // no home document: not an error
        warnings.push(`${item.title} (${item.route}): ${(e as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  pages.sort((a, b) => a.route.localeCompare(b.route))
  if (pages.length === 0) throw new Error('The site has no public document to publish (are the files public in the asset library?)')

  // files used by the documents
  const files = new Map<string, string>()          // dam path -> address in the output / absolute address
  const copies: { from: string; to: string }[] = []
  const assetUrl = (damPath: string): string => {
    const hit = files.get(damPath)
    if (hit) return hit
    const clean = damPath.replace(/&amp;/g, '&')
    let name = clean.slice('/dam-asset/'.length).split('?')[0]
    try { name = decodeURIComponent(name) } catch { /* as written */ }
    const leaf = name.split('/').pop() || 'file'
    const safeLeaf = leaf.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_')
    const to = `assets/files/${createHash('sha1').update(name).digest('hex').slice(0, 8)}-${safeLeaf}`
    const result = raw.copyAssets === false ? assetBase + clean : base + to
    if (raw.copyAssets !== false) copies.push({ from: assetBase + clean, to })
    files.set(damPath, result)
    return result
  }

  const out = raw.outDir
  const written: string[] = []
  const put = async (rel: string, data: string | Buffer): Promise<void> => {
    const full = join(out, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data)
    written.push(rel)
  }

  // drop what a previous run wrote and this one does not
  let previous: string[] = []
  try { previous = (JSON.parse(await readFile(join(out, '.whoobe-docs.json'), 'utf8')) as { files: string[] }).files } catch { /* first run */ }

  const searchRes = await doFetch(`${api}/public/docs/${id}/search-index`)
  if (!searchRes.ok) throw new Error(`search index: ${searchRes.status}`)
  const searchJson = await searchRes.text()

  let broken = 0
  let anyCode = false
  let anyMermaid = false
  const rendered: { route: string; html: string; page: PageData }[] = []
  for (const { route, data } of pages) {
    const html = rewritePageHtml(data.html, base, assetUrl)
    const brokenLinks = (html.match(/<a href="#"/g) ?? []).length
    if (brokenLinks) { broken += brokenLinks; warnings.push(`${data.path}: ${brokenLinks} broken link(s)`) }
    const hasCode = /<code class="language-(?!mermaid")/.test(html)
    anyCode = anyCode || hasCode
    anyMermaid = anyMermaid || /<code class="language-mermaid"/.test(html)
    rendered.push({ route, html, page: data })
  }
  if (raw.strict && broken > 0) throw new Error(`${broken} broken link(s):\n  ${warnings.filter((w) => /broken link/.test(w)).join('\n  ')}`)

  for (const r of rendered) {
    const hasCode = /<code class="language-(?!mermaid")/.test(r.html)
    const hasMermaid = /<code class="language-mermaid"/.test(r.html)
    await put(`${routeDir(r.route)}index.html`, pageHtml({ site, page: r.page, html: r.html, nav: navBody.nav, base, siteUrl: raw.siteUrl, hasCode, hasMermaid }))
  }
  await put('404.html', pageHtml({ site, page: null, html: '', nav: navBody.nav, base, hasCode: false, notFound: true }))
  await put('assets/docs.css', DOCS_CSS)
  await put('assets/docs.js', DOCS_JS)
  await put('assets/search-index.json', searchJson)

  const copyFrom = async (from: string, rel: string): Promise<void> => { const to = join(out, rel); await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); written.push(rel) }
  await copyFrom(join(packageRoot('minisearch'), 'dist', 'umd', 'index.js'), 'assets/minisearch.js')
  if (anyCode) {
    const hl = packageRoot('@highlightjs/cdn-assets')
    await copyFrom(join(hl, 'highlight.min.js'), 'assets/hljs/highlight.min.js')
    await copyFrom(join(hl, 'styles', 'github-dark.min.css'), 'assets/hljs/theme.css')
  }
  if (anyMermaid) await copyFrom(join(packageRoot('mermaid'), 'dist', 'mermaid.min.js'), 'assets/mermaid/mermaid.min.js')

  // the files the documents use
  let copied = 0
  for (const c of copies) {
    try {
      const res = await doFetch(c.from)
      if (!res.ok) throw new Error(`${res.status}`)
      await put(c.to, Buffer.from(await res.arrayBuffer()))
      copied++
    } catch (e) {
      warnings.push(`file ${c.from}: ${(e as Error).message} (the page keeps a link to the CMS)`)
      for (const [k, v] of files) if (v === base + c.to) files.set(k, c.from)
    }
  }

  const origin = raw.siteUrl?.replace(/\/$/, '')
  if (origin) {
    const urls = rendered.map((r) => `  <url><loc>${esc(origin + base + routeDir(r.route))}</loc>${r.page.updatedAt ? `<lastmod>${esc(r.page.updatedAt.slice(0, 10))}</lastmod>` : ''}</url>`)
    await put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
  }
  await put('robots.txt', `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}${base}sitemap.xml\n` : ''}`)

  for (const old of previous) if (!written.includes(old)) await rm(join(out, old), { force: true })
  await writeFile(join(out, '.whoobe-docs.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: written }, null, 2))

  log(`Done: ${rendered.length} page(s), ${copied} file(s) copied, search index ${(searchJson.length / 1024).toFixed(0)} kB.`)
  for (const w of warnings) log(`  warning: ${w}`)
  return { pages: rendered.length, files: written.length, warnings }
}

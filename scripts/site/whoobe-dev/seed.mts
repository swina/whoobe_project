// Loads scripts/site/whoobe-dev/content.json (made by generate.mjs) into the database the DB_* / DATABASE_URL variables point to:
// the website "whoobe.dev", the header and footer snippets, the default template "Site layout" that places them, the five pages and
// a copy of the Blog pages of the website "whoobe website" (the Blog data class is shared). Idempotent: what exists is updated in place.
// Run it from packages/core so the modules resolve:   cd packages/core && npx tsx ../../scripts/site/whoobe-dev/seed.mts
// (it needs the DB_* variables of the repository's .env, or DATABASE_URL). It talks to the database directly, like the seed of the product.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listWebsites, createWebsite, updateWebsite } from '../../../packages/core/src/db/websites-records.ts';
import { listWhoobeOneSnippets, createWhoobeOneSnippet, updateWhoobeOneSnippet } from '../../../packages/core/src/db/whoobe-one-snippet-records.ts';
import { listWebsiteTemplates, createWebsiteTemplate, updateWebsiteTemplate } from '../../../packages/core/src/db/website-templates-records.ts';
import { listWhoobePages, createWhoobePage, updateWhoobePage } from '../../../packages/core/src/db/whoobe-pages-records.ts';
import { listThemes } from '../../../packages/core/src/db/themes-records.ts';
import { closeDb } from '../../../packages/core/src/db/client.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const c = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));

// the theme: the site uses the one of the website "whoobe website" (dark, Inter and Montserrat, glass panels); it must exist
const theme = (await listThemes()).find((t) => t.name === c.themeName);
if (!theme) throw new Error(`theme "${c.themeName}" not found: create it first (Settings > Themes) or change themeName in generate.mjs`);
console.log(`theme: ${theme.name}`);

// website
const sites = await listWebsites();
let site = sites.find((w) => w.name === c.website.name);
if (!site) {
  site = await createWebsite({ name: c.website.name, rootPath: c.website.rootPath, domains: c.website.domains, defaultLocale: c.website.defaultLocale, supportedLocales: c.website.supportedLocales, settings: {} });
  console.log(`website created: ${site.name} (${site.rootPath})`);
} else console.log(`website exists: ${site.name} (${site.rootPath})`);
if (site.themeId !== theme.id) { await updateWebsite(site.id, { themeId: theme.id }); console.log('website theme set'); }

// snippets
const existingSnippets = await listWhoobeOneSnippets();
const snippetId: Record<string, string> = {};
for (const s of c.snippets) {
  const found = existingSnippets.find((x) => x.name === s.name);
  if (found) {
    await updateWhoobeOneSnippet(found.id, { name: s.name, category: s.category, icon: s.icon, node: s.node, notes: s.notes, themeId: theme.id });
    snippetId[s.name] = found.id;
    console.log(`snippet updated: ${s.name}`);
  } else {
    const created = await createWhoobeOneSnippet({ name: s.name, category: s.category, icon: s.icon, node: s.node, notes: s.notes, themeId: theme.id });
    snippetId[s.name] = created.id;
    console.log(`snippet created: ${s.name}`);
  }
}

// the default template: the header and the footer around every page
const layout = {
  header: { pageIds: [], snippetIds: [snippetId[c.template.headerSnippet]], className: 'w-full sticky top-0 z-40' },
  footer: { pageIds: [], snippetIds: [snippetId[c.template.footerSnippet]], className: 'w-full' },
  main: { pageIds: [], className: 'w-full bg-[#0F1115]' },
  body: { pageIds: [], className: 'bg-[#0F1115] text-slate-200 antialiased' },
};
const templates = await listWebsiteTemplates(site.id);
const tpl = templates.find((t) => t.name === c.template.name);
if (tpl) {
  await updateWebsiteTemplate(tpl.id, { description: c.template.description, layout, isDefault: true });
  console.log(`template updated: ${c.template.name}`);
} else {
  await createWebsiteTemplate({ websiteId: site.id, name: c.template.name, description: c.template.description, layout, isDefault: true });
  console.log(`template created: ${c.template.name}`);
}

// slots: a section of a page that holds a copy of a snippet of the library (fresh ids, `sourceSnippetId`, like dropping the snippet in the editor)
const libSnippets = await listWhoobeOneSnippets();
const freshId = () => `whoobe-${Math.random().toString(36).slice(2, 7)}`;
const withFreshIds = (n: any): any => { if (Array.isArray(n)) return n.map(withFreshIds); if (n && typeof n === 'object') { const o: any = {}; for (const [k, v] of Object.entries(n)) o[k] = k === 'id' && typeof v === 'string' ? freshId() : withFreshIds(v); return o; } return n; };
const findNode = (n: any, id: string): any => { if (!n || typeof n !== 'object') return null; if (n.id === id) return n; for (const k of n.blocks ?? []) { const f = findNode(k, id); if (f) return f; } return null; };
for (const slot of c.slots ?? []) {
  const page = c.pages.find((x: any) => x.slug === slot.pageSlug);
  const lib = libSnippets.find((x) => x.name === slot.snippet);
  const node = page && findNode(page.content, slot.nodeId);
  if (!page || !node) throw new Error(`slot: page or node not found (${slot.pageSlug} ${slot.nodeId})`);
  if (!lib) throw new Error(`slot: snippet "${slot.snippet}" not found in the library`);
  const copy = withFreshIds(lib.node);
  copy.sourceSnippetId = lib.id;
  node.blocks = [copy];
  console.log(`slot filled: ${slot.pageSlug} <- "${slot.snippet}"`);
}

// pages
const pages = await listWhoobePages(site.id);
for (const p of c.pages) {
  const found = pages.find((x) => x.slug === p.slug);
  if (found) {
    await updateWhoobePage(found.id, { title: p.title, category: p.category, kind: p.kind, content: p.content, seo: p.seo, themeId: theme.id, published: true });
    console.log(`page updated: ${p.slug}`);
  } else {
    const created = await createWhoobePage({ slug: p.slug, title: p.title, category: p.category, kind: p.kind, content: p.content, seo: p.seo, themeId: theme.id, websiteId: site.id });
    await updateWhoobePage(created.id, { published: true });
    console.log(`page created: ${p.slug}`);
  }
}

// the Blog pages, copied once from the old website (they bind the shared Blog data class); an existing copy is left as it is
const old = (await listWebsites()).find((w) => w.name === c.copyFromWebsite.name);
if (old) {
  const oldPages = await listWhoobePages(old.id);
  for (const slug of c.copyFromWebsite.slugs) {
    if (pages.some((x) => x.slug === slug)) { console.log(`blog page exists: ${slug}`); continue; }
    const src = oldPages.find((x) => x.slug === slug);
    if (!src) { console.log(`blog page not found in "${old.name}": ${slug}`); continue; }
    const created = await createWhoobePage({ slug: src.slug, title: src.title, category: src.category, kind: 'content', content: src.content, seo: src.seo as any, themeId: src.themeId, websiteId: site.id });
    await updateWhoobePage(created.id, { published: true });
    console.log(`blog page copied: ${slug}`);
  }
} else console.log(`website "${c.copyFromWebsite.name}" not found: the Blog pages were not copied`);

// a card's link to its detail page holds a page id: in the copy it must point at the copy of that page, not at the old website's page
if (old) {
  const oldBySlug = new Map((await listWhoobePages(old.id)).map((o) => [o.id, o.slug] as const));
  const mine = await listWhoobePages(site.id);
  const mineBySlug = new Map(mine.map((m) => [m.slug, m.id] as const));
  const retarget = (n: any): boolean => {
    let changed = false;
    if (Array.isArray(n)) { for (const x of n) changed = retarget(x) || changed; return changed; }
    if (!n || typeof n !== 'object') return false;
    const t = n.dynamicLink?.targetPageId;
    const slug = t && oldBySlug.get(t);
    const mineId = slug && mineBySlug.get(slug);
    if (mineId && mineId !== t) { n.dynamicLink.targetPageId = mineId; changed = true; }
    for (const v of Object.values(n)) changed = retarget(v) || changed;
    return changed;
  };
  for (const m of mine) {
    const content = structuredClone(m.content);
    if (retarget(content)) { await updateWhoobePage(m.id, { content }); console.log(`detail links retargeted: ${m.slug}`); }
  }
}

await closeDb();

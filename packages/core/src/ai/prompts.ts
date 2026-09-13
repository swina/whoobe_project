// Prompt templates + structural validation for AI generation of Whoobe One
// page/snippet content (docs/plans/ai/ai-pages-snippets-generator.md).
// The system prompt teaches the model the Element-tree JSON contract (the
// same tree apps/whoobe-one-spike's editor.document stores and saves as
// page content); validation is deliberately shallow - structural only, the
// editor re-instantiates nodes through its own builders and defensive
// rendering, so a hand-written tree with a few unknown fields still works
// as long as the shape is right.

export interface AiGenerationContext {
  kind: 'snippet' | 'page';
  prompt: string;
  selectedTag?: string | null;
  pageTitle?: string | null;
  pageCategory?: string | null;
}

export interface AiTextContext {
  /** The HTML tag of the target element (e.g. "h1", "h2", "p", "span", "button"). */
  tag: string;
  /** The element's existing content so the model can rewrite or expand it. */
  existingContent?: string | null;
  /** A short description of the element's role in the section (e.g. heading for a feature section). */
  roleHint?: string | null;
  /** The user's own instruction (may be empty for quick generation). */
  prompt: string;
}

const ELEMENT_CONTRACT = `The output must be a JSON object matching the Whoobe One Element tree schema. An Element node has:
- "id": a short unique string (e.g. "gen1", "gen2"). Every node MUST have a unique id.
- "type": "container" for any node that has children, "element" for leaf nodes. Do NOT use builder names ("Flexbox", "Heading", ...) - the editor's renderer dispatches on "container"/"element" only.
- "element": the concrete HTML tag this node renders as - "div" for containers, "h1".."h6", "p", "span", "img", "a", "button", "input", "textarea", "select", "blockquote", "pre", "video". Required on every node.
- "tag": "document" for the page root, "div" for containers (Flexbox/Grid), "h1".."h6" for headings (set "level": 1-6 too), "p", "span", "img", "a", "button", "input", "textarea", "select", "blockquote", "pre", "section", "video".
- "blocks": array of child Element nodes (empty array or omitted for leaf nodes).
- "css": { "css": "Tailwind utility classes for the element itself", "container": "Tailwind utility classes for its wrapper" }. Use Tailwind CSS utility classes.
- "content": plain text content for text elements.
- "style": optional inline CSS string.
- "image": optional { "url": "https://picsum.photos/seed/<this node's own id>/1200/800" } for img elements - use this exact placeholder pattern with the node's id as seed. NEVER invent Unsplash or other real photo URLs - invented IDs do not exist and render as broken images (the server replaces any image URL anyway).
- "icon": an emoji or lucide icon name, optional.
- "editable": true for text elements, false otherwise.
- "description", "helper", "dialog": optional strings.
- A page root node additionally has "tag": "document", "type": "container", "element": "div", "icon": "dashboard". Its "css.container" is optional (editor applies default styling via '.editor-custom' class).
- "dataBinding", "gsap", "link", "alpine", "events", "slider", "formConfig" must be OMITTED - the composer sets those manually.

Rules:
- Output ONLY the JSON object, no commentary, no markdown fences.
- Keep the tree reasonably small (max ~40 nodes total).
- Use semantic headings and short paragraphs; use Tailwind classes for spacing, typography, colors (e.g. text-slate-900, bg-indigo-600, rounded-xl, px-6 py-4).
- Text content must be relevant to the user's request, with real, natural copy (not lorem ipsum).`;

export function buildSystemPrompt(): string {
  return `You are an expert front-end developer and UI designer generating content for the Whoobe One page composer.\n${ELEMENT_CONTRACT}`;
}

export function buildUserPrompt(context: AiGenerationContext): string {
  if (context.kind === 'snippet') {
    const around = context.selectedTag ? ` The generated snippet will be inserted near an existing element of tag "${context.selectedTag}".` : '';
    return `Generate a reusable UI snippet (a single container Element node with its children) for the following request: ${context.prompt}${around}`;
  }
  const title = context.pageTitle ? ` Title: "${context.pageTitle}".` : '';
  const category = context.pageCategory ? ` Category: "${context.pageCategory}".` : '';
  return `Generate a complete page (a document root Element node with "tag": "document" and its child tree) for the following request: ${context.prompt}${title}${category} Make it a full, cohesive page layout with header, hero, content sections, and footer.`;
}

/** Builds a prompt for inline text content generation (kind: 'text'). The
 *  model receives context about the element and is told to output ONLY the
 *  plain text string — no JSON, no markdown fences, no commentary. */
export function buildTextPrompt(context: AiTextContext): string {
  const tagLabels: Record<string, string> = {
    h1: 'a level-1 heading', h2: 'a level-2 heading', h3: 'a level-3 heading',
    h4: 'a level-4 heading', h5: 'a level-5 heading', h6: 'a level-6 heading',
    p: 'a paragraph', span: 'a short inline text fragment',
    button: 'a button label', blockquote: 'a block quote',
    a: 'a link label', label: 'a field label',
  };
  const label = tagLabels[context.tag] || `a ${context.tag} element`;
  const role = context.roleHint ? ` Role: ${context.roleHint}.` : '';
  const existing = context.existingContent
    ? ` The current content is: "${context.existingContent}". You may rewrite, expand, or replace it.`
    : '';
  const instruction = context.prompt.trim()
    ? context.prompt.trim()
    : `Write compelling ${label} text${existing ? ' that replaces the current content' : ''}.${role}`;
  return `You output ONLY a plain text string — no JSON, no markdown fences, no explanation, no extra whitespace.

Generate the text content for ${label} in a web UI.${role}${existing}

User instruction: ${instruction}
The output must be a single plain-text string.`;
}

const ALLOWED_TAGS = new Set([
  'document', 'div', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'img', 'a', 'button', 'input', 'textarea', 'select', 'option', 'label', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'video', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'form', 'hr', 'br',
]);

const MAX_NODES = 200;
const PAGE_MAX_NODES = 30;
const SNIPPET_MAX_NODES = 15;

export function buildWebsiteStructurePrompt(context: { prompt: string }): string {
  return `You output ONLY valid JSON, no markdown fences, no commentary.

Generate a website structure as this JSON shape:
{
  "website": { "name": "short-url-safe-name", "defaultLocale": "en", "supportedLocales": ["en"] },
  "pages": [
    {
      "slug": "home", "title": "Home", "category": "main",
      "content": {
        "id": "root", "type": "container", "element": "div", "tag": "document", "icon": "dashboard",
        "css": { "css": "bg-white", "container": "" },
        "blocks": [
          {
            "id": "sec1", "type": "container", "element": "div", "tag": "section",
            "css": { "css": "py-16 bg-indigo-600 text-white text-center" },
            "blocks": [
              { "id": "t1", "type": "element", "element": "h1", "tag": "h1", "content": "Welcome", "editable": true, "css": { "css": "text-4xl font-bold" } },
              { "id": "t2", "type": "element", "element": "p", "tag": "p", "content": "Description", "editable": true, "css": { "css": "mt-4 text-lg" } }
            ]
          }
        ]
      }
    }
  ],
  "snippets": [
    {
      "name": "Hero Banner", "category": "hero",
      "node": {
        "id": "s1", "type": "container", "element": "div", "tag": "section",
        "css": { "css": "py-12 bg-indigo-600 text-white text-center" },
        "blocks": [
          { "id": "s1a", "type": "element", "element": "h2", "tag": "h2", "content": "Hero Title", "editable": true, "css": { "css": "text-3xl font-bold" } }
        ]
      }
    }
  ]
}

CONSTRAINTS:
- 3 pages exactly: a homepage plus two secondary pages.
- 3 snippets exactly.
- Each page "content" root has "tag":"document","type":"container","element":"div","icon":"dashboard".
- Each snippet "node" is a container subtree (no document root).
- Each page max 30 nodes. Each snippet max 15 nodes.
- Keep every tree shallow and compact. Prefer 1-2 nested section levels.
- Each node: "id" unique, "type" "container"|"element", "element" HTML tag, "blocks" children array, "css":{"css":"tailwind classes","container":"tailwind classes"}, "content" text for text nodes, "editable":true for text.
- Use Tailwind for spacing/colors. Real text, not lorem ipsum. Omit dataBinding/gsap/link/alpine/events/slider/formConfig.

User request: ${context.prompt}`;
}

export function collectNodes(node: Record<string, unknown>): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [node];
  const children = node.blocks;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') nodes.push(...collectNodes(child as Record<string, unknown>));
    }
  }
  return nodes;
}

/** Replaces every generated image URL with a guaranteed-valid placeholder
 *  (picsum.photos, seeded deterministically per node id - always serves a
 *  real photo). The contract tells the model to use this pattern, but
 *  models frequently ignore instructions and invent unsplash.com URLs
 *  whose photo IDs don't exist - those render as broken <img>s on the
 *  canvas. Applied server-side after validation (and defensively in the
 *  spike's normalizeGeneratedTree), so whatever lands in
 *  whoobe_ai_generated and on the canvas is always renderable. */
export function sanitizeGeneratedImages(node: Record<string, any>): void {
  if (node.element === 'img' && node.image?.url) {
    node.image.url = `https://picsum.photos/seed/${node.id}/1200/800`;
  }
  if (Array.isArray(node.blocks)) {
    for (const child of node.blocks) sanitizeGeneratedImages(child);
  }
}

/** Shallow structural validation of a generated Element tree - checks the
 *  shape (root object, unique ids, blocks arrays, known tags) but not the
 *  Tailwind classes or exact builder semantics; the editor's own defensive
 *  rendering tolerates the rest. Returns an error message or null. */
export function validateElementTree(json: unknown): string | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return 'Expected a single Element object at the top level.';
  }
  const root = json as Record<string, unknown>;
  if (root.blocks !== undefined && !Array.isArray(root.blocks)) return '"blocks" must be an array.';
  const nodes = collectNodes(root);
  if (nodes.length > MAX_NODES) return `Generated tree too large (${nodes.length} nodes, max ${MAX_NODES}).`;
  const ids = new Set<string>();
  for (const node of nodes) {
    const id = node.id;
    if (typeof id !== 'string' || !id) return 'Every element must have a unique string "id".';
    if (ids.has(id)) return `Duplicate element id "${id}".`;
    ids.add(id);
    const tag = node.tag;
    if (tag !== undefined && (typeof tag !== 'string' || !ALLOWED_TAGS.has(tag))) {
      return `Unsupported tag "${String(tag)}".`;
    }
    if (node.css !== undefined && (typeof node.css !== 'object' || node.css === null)) return '"css" must be an object { css, container }.';
    if (node.content !== undefined && typeof node.content !== 'string') return '"content" must be a string.';
    if (node.style !== undefined && typeof node.style !== 'string') return '"style" must be a string.';
  }
  return null;
}

/** Validates a generated website structure (website + pages + snippets). */
export function validateWebsiteStructure(json: unknown): string | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return 'Expected a single object at the top level.';
  }
  const root = json as Record<string, unknown>;

  if (typeof root.website !== 'object' || root.website === null) return '"website" object is required.';
  const website = root.website as Record<string, unknown>;
  if (typeof website.name !== 'string' || !website.name.trim()) return '"website.name" must be a non-empty string.';

  if (!Array.isArray(root.pages) || root.pages.length === 0) return '"pages" must be a non-empty array.';
  if (root.pages.length < 3) return `"pages" must contain at least 3 pages (got ${root.pages.length}).`;
  if (root.pages.length > 5) return `"pages" too many (${root.pages.length}, max 5).`;
  for (let i = 0; i < root.pages.length; i++) {
    const page = root.pages[i] as Record<string, unknown>;
    if (typeof page.slug !== 'string' || !page.slug.trim()) return `pages[${i}].slug must be a non-empty string.`;
    if (typeof page.title !== 'string' || !page.title.trim()) return `pages[${i}].title must be a non-empty string.`;
    if (page.content === null || page.content === undefined) return `pages[${i}].content is required.`;
    const contentError = validateElementTree(page.content);
    if (contentError) return `pages[${i}].content: ${contentError}`;
    const nodes = collectNodes(page.content as Record<string, unknown>);
    if (nodes.length > PAGE_MAX_NODES) return `pages[${i}].content too large (${nodes.length} nodes, max ${PAGE_MAX_NODES}).`;
  }

  if (!Array.isArray(root.snippets)) return '"snippets" must be an array.';
  if (root.snippets.length > 8) return `"snippets" too many (${root.snippets.length}, max 8).`;
  if (root.snippets.length > 0 && root.snippets.length < 3) {
    return `"snippets" should have at least 3 entries (got ${root.snippets.length}).`;
  }
  for (let i = 0; i < root.snippets.length; i++) {
    const snippet = root.snippets[i] as Record<string, unknown>;
    if (typeof snippet.name !== 'string' || !snippet.name.trim()) return `snippets[${i}].name must be a non-empty string.`;
    if (typeof snippet.category !== 'string' || !snippet.category.trim()) return `snippets[${i}].category must be a non-empty string.`;
    if (snippet.node === null || snippet.node === undefined) return `snippets[${i}].node is required.`;
    const nodeError = validateElementTree(snippet.node);
    if (nodeError) return `snippets[${i}].node: ${nodeError}`;
    const nodes = collectNodes(snippet.node as Record<string, unknown>);
    if (nodes.length > SNIPPET_MAX_NODES) return `snippets[${i}].node too large (${nodes.length} nodes, max ${SNIPPET_MAX_NODES}).`;
  }

  return null;
}
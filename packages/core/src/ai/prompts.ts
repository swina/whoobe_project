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
  // Snippet-only: the selected node the generated tree will be inserted
  // next to/inside (tag, e.g. 'flexbox').
  selectedTag?: string | null;
  // Page-only: existing document metadata the model can use for tone.
  pageTitle?: string | null;
  pageCategory?: string | null;
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
- A page root node additionally has "tag": "document", "type": "container", "element": "div", "icon": "dashboard", and its "css.container" should include "gap-4 min-h-[600px] bg-white".
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

const ALLOWED_TAGS = new Set([
  'document', 'div', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'img', 'a', 'button', 'input', 'textarea', 'select', 'option', 'label', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'video', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'form', 'hr', 'br',
]);

const MAX_NODES = 200;

function collectNodes(node: Record<string, unknown>): Record<string, unknown>[] {
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
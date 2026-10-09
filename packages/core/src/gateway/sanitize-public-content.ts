import { marked } from 'marked';
import { sanitizeRichText, sanitizeSvg } from '@whoobe-cms/schema';

// Strips the raw gateway identifiers bind-page-content.ts resolved at
// save time from a page's content before it's ever sent to /public/pages/*
// or /public/page/* (apps/core-api/src/server.ts) - a published site only
// ever sees the opaque bindingId, never the endpointName/routePath/filters
// that would let a visitor's browser call the gateway with an arbitrary
// target. See docs/plans/api-gateway/gateway-auth-authz.md.
//
// `fieldPath`/`params`/`transform` are intentionally KEPT on gatewayBinding:
// `fieldPath` is used locally (packages/sdk/renderer/src/walk.ts) to read a
// field off an already-fetched repeater item without a second gateway call;
// `params` is the {name}-placeholder template the renderer substitutes with
// the visitor's own urlParams before sending resolved values to /resolve;
// `transform` only affects local rendering and is never sent to the gateway.

/** Generic deep-walk (not just `.blocks`) - a page's `content` tree shows up
 *  nested at very different depths across the public response shapes in
 *  server.ts (a page's own `content`, a website-template slot's per-module
 *  `pages[].content`, a directly-authored slot's custom node, the synthetic
 *  404 page's `content`), so this walks every object/array it finds rather
 *  than assuming one fixed shape. */
/** Rich text of an element node (`content`, rendered as HTML by every public consumer): a published page must never
 *  carry script, whatever an author - or a visitor through a public form - managed to store. */
/** The Markdown element stores its source; every public consumer (React/Vue/Svelte adapters, Next/Nuxt projects, the
 *  mobile app) renders `content` as HTML, so the conversion is done here, once, for all of them. */
function markdownToHtml(source: string): string {
  try {
    return marked.parse(source, { async: false }) as string;
  } catch {
    return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

function sanitizeNodeContent(obj: Record<string, unknown>): void {
  if (typeof obj.content !== 'string') return;
  if (!('element' in obj) && obj.type !== 'element') return;
  let content: string = obj.content;
  if (obj.tag === 'markdown') {
    // from here on it is an ordinary element with HTML content (so the editor's own public route, which renders what
    // this returns, does not convert it a second time); the sanitizer below runs on the converted HTML
    content = markdownToHtml(content);
    obj.tag = 'element';
  }
  obj.content = obj.element === 'svg' || content.trimStart().startsWith('<svg') ? sanitizeSvg(content) : sanitizeRichText(content);
}

function walkAndStrip(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) walkAndStrip(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  sanitizeNodeContent(obj);

  const formConfig = obj.formConfig;
  if (formConfig && typeof formConfig === 'object') {
    delete (formConfig as Record<string, unknown>).gatewayEndpointName;
    delete (formConfig as Record<string, unknown>).gatewayRoutePath;
  }

  // An Upload field's own folder is the author's business: the server picks it, a visitor's browser never needs it
  const uploadConfig = obj.uploadConfig;
  if (uploadConfig && typeof uploadConfig === 'object') delete (uploadConfig as Record<string, unknown>).targetFolder;

  const gatewayBinding = obj.gatewayBinding;
  if (gatewayBinding && typeof gatewayBinding === 'object') {
    delete (gatewayBinding as Record<string, unknown>).endpointName;
    delete (gatewayBinding as Record<string, unknown>).routePath;
    delete (gatewayBinding as Record<string, unknown>).filters;
  }

  for (const key of Object.keys(obj)) {
    walkAndStrip(obj[key]);
  }
}

/** Deep-clones `value` (a page, a full `{page,params,layout}` response body,
 *  or any structure that may embed page content trees) and strips it for
 *  public consumption - never mutates the caller's copy (that's still the
 *  CMS's own, editor-facing record, which needs the raw fields to keep
 *  working). */
export function sanitizePublicGatewayContent<T>(value: T): T {
  if (value == null) return value;
  const clone = JSON.parse(JSON.stringify(value));
  walkAndStrip(clone);
  return clone;
}

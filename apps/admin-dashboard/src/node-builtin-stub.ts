// Empty stand-in for Node-only modules (fs, path, url, source-map-js) in the dev server's browser bundle.
//
// The browser calls sanitizeRichText() from @whoobe-cms/schema, which uses sanitize-html, which depends on postcss.
// postcss's file-path and source-map code imports those Node modules at load time, but the sanitizer only ever calls
// postcss's parse() on a style attribute, so none of that code runs in the browser. Without this stub Vite's dev
// server answers with a proxy that logs "Module X has been externalized for browser compatibility" on every property
// access. An empty object is what that proxy already stands for; production builds do the same silently.
export default {}

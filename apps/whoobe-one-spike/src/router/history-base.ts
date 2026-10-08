// Base path of the editor's router. The app is mounted under a base (`/whoobe-one/` behind the reverse proxy) and its
// own screens live there (`/whoobe-one/editor`). A website's pages are previewed at the website's own address on the
// host (`/whoobe-website/blog`, the proxy sends them here): that is outside the base, and a router created with the
// base would rewrite the address bar to `/whoobe-one/whoobe-website/blog` right after loading. Opened outside its
// mount point the app therefore routes from the root and leaves the address alone.
import { isUnderBase } from '../preview-links'

export function chooseHistoryBase(pathname: string, baseUrl: string): string {
  return isUnderBase(pathname, baseUrl) || baseUrl.replace(/\/+$/, '') === '' ? baseUrl : '/'
}

import { isIPv4 } from 'node:net';

/** `list` null or empty = any address. Entries are exact addresses or IPv4 CIDR ranges (a.b.c.d/n); IPv4-mapped IPv6 is unwrapped. */
export function ipAllowed(ip: string, list: readonly string[] | null | undefined): boolean {
  if (!list || list.length === 0) return true;
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  for (const entry of list) {
    if (entry === addr) return true;
    const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(entry);
    if (m && isIPv4(addr) && isIPv4(m[1]) && Number(m[2]) <= 32 && inCidr(addr, m[1], Number(m[2]))) return true;
  }
  return false;
}

const toInt = (a: string): number => a.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;

function inCidr(addr: string, base: string, bits: number): boolean {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(addr) & mask) === (toInt(base) & mask);
}

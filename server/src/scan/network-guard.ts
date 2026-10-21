// Keeps a public deployment from being used to reach internal networks (SSRF): the scanner opens
// whatever addresses a site points to, so pages, links, images and files are all checked here.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Says whether the scanner may contact this URL. */
export type TargetGuard = (url: string) => Promise<boolean>;

/** Private, loopback, link-local (cloud metadata), carrier-grade NAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]!);

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const v6 = ip.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) || // fc00::/7 unique local
    /^fe[89ab]/.test(v6) || // fe80::/10 link-local
    v6.startsWith('ff') // multicast
  );
}

/**
 * Allows only public http(s) hosts. Hostnames are resolved once and cached for the scan.
 * A host that doesn't resolve is allowed: the request will simply fail as it would anyway.
 */
export function createTargetGuard(): TargetGuard {
  const cache = new Map<string, Promise<boolean>>();
  return (url) => {
    let host: string;
    try {
      const parsed = new URL(url);
      // data:, blob: and the like never leave the browser.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return Promise.resolve(true);
      host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    } catch {
      return Promise.resolve(false);
    }
    let allowed = cache.get(host);
    if (!allowed) {
      allowed = isPublicHost(host);
      cache.set(host, allowed);
    }
    return allowed;
  };
}

async function isPublicHost(host: string): Promise<boolean> {
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.every((address) => !isPrivateAddress(address.address));
  } catch {
    return true;
  }
}

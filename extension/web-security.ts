import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 256_000;
const BLOCKED_HOSTS = new Set(['metadata', 'metadata.google.internal', 'metadata.aws.internal']);

function isBlockedIpv4(address: string): boolean {
  const [a, b, c] = address.split('.').map(Number);
  return a === 0
    || a === 10
    || (a === 100 && b >= 64 && b <= 127)
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

export function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (net.isIPv4(normalized)) return !isBlockedIpv4(normalized);
  if (!net.isIPv6(normalized)) return false;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return false;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? !isBlockedIpv4(mapped) : true;
}

export async function validatePublicUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password) throw new Error('Page URLs must not contain credentials.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Private and metadata addresses are not allowed.');
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error('Private and metadata addresses are not allowed.');
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Private and metadata addresses are not allowed.');
}

const secureLookup: net.LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true, verbatim: true }).then(
    (addresses) => {
      const address = addresses.find((entry) => isPublicAddress(entry.address));
      if (!address || addresses.some((entry) => !isPublicAddress(entry.address))) {
        callback(new Error('Private and metadata addresses are not allowed.'), options.all ? [] : '', 4);
      } else if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, address.address, address.family);
      }
    },
    (error: Error) => callback(error, options.all ? [] : '', 4),
  );
};

async function requestOnce(url: URL, signal: AbortSignal): Promise<{ status: number; location?: string; body: string }> {
  await validatePublicUrl(url);
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, { signal, lookup: secureLookup, headers: { 'User-Agent': 'Sero-OpenAI-Extender/0.1', Accept: 'text/html,text/plain;q=0.9' } }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) { response.resume(); resolve({ status, location, body: '' }); return; }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`Page request failed (${status}).`)); return; }
      const declared = Number(response.headers['content-length'] ?? 0);
      if (declared > MAX_RESPONSE_BYTES) { response.destroy(); reject(new Error('Page response exceeds 256 KB.')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) { response.destroy(new Error('Page response exceeds 256 KB.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

export async function readPublicPage(input: string, signal: AbortSignal): Promise<{ url: string; body: string }> {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error('Page URL is invalid.'); }
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await requestOnce(url, signal);
    if (!response.location) return { url: url.toString(), body: response.body };
    if (redirects === MAX_REDIRECTS) throw new Error('Page request has too many redirects.');
    url = new URL(response.location, url);
  }
  throw new Error('Page request has too many redirects.');
}

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | undefined {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}

export function validateImage(bytes: Uint8Array): SupportedImageMime {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Input image exceeds 10 MB.');
  const mime = detectImageMime(bytes);
  if (!mime) throw new Error('Image must contain valid PNG, JPEG, or WebP bytes.');
  return mime;
}

export async function readWorkspaceImage(cwd: string, requested: string): Promise<{ bytes: Uint8Array; mime: SupportedImageMime }> {
  const workspace = await fs.realpath(cwd);
  const candidate = path.resolve(workspace, requested);
  const resolved = await fs.realpath(candidate);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Image path must stay inside the workspace and must not use symlinks outside it.');
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error(stat.size > MAX_IMAGE_BYTES ? 'Input image exceeds 10 MB.' : 'Image path must identify a file.');
  const bytes = await fs.readFile(resolved);
  return { bytes, mime: validateImage(bytes) };
}

export async function prepareOutputDirectory(cwd: string): Promise<string> {
  const workspace = await fs.realpath(cwd);
  const directory = path.join(workspace, '.sero', 'generated', 'openai-extender');
  await fs.mkdir(directory, { recursive: true });
  const resolved = await fs.realpath(directory);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Generated image path must stay inside the workspace and must not use symlinks outside it.');
  return resolved;
}

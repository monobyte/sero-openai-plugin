import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectImageMime, readWorkspaceImage, validateImage } from '../image-security';
import { isPublicAddress, validatePublicUrl } from '../web-security';

describe('web and image security', () => {
  it('blocks loopback, private, link-local, and metadata destinations', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254', '198.18.0.1', '198.51.100.1', '203.0.113.1', '::1', 'fe80::1', 'fd00::1', '2001:db8::1']) expect(isPublicAddress(address)).toBe(false);
    await expect(validatePublicUrl(new URL('http://127.0.0.1/'))).rejects.toThrow('Private');
    await expect(validatePublicUrl(new URL('http://169.254.169.254/latest/meta-data/'))).rejects.toThrow('Private');
    await expect(validatePublicUrl(new URL('http://metadata.google.internal/'))).rejects.toThrow('Private');
    await expect(validatePublicUrl(new URL('file:///etc/passwd'))).rejects.toThrow('Only HTTP');
    await expect(validatePublicUrl(new URL('https://user:secret@example.com/'))).rejects.toThrow('credentials');
  });
  it('blocks workspace symlink escape and validates image bytes instead of extensions', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'oai-workspace-'));
    const outside = path.join(await mkdtemp(path.join(os.tmpdir(), 'oai-outside-')), 'image.png');
    await writeFile(outside, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await symlink(outside, path.join(workspace, 'escape.png'));
    await expect(readWorkspaceImage(workspace, 'escape.png')).rejects.toThrow('symlinks outside');
    expect(detectImageMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
    expect(() => validateImage(new TextEncoder().encode('not an image'))).toThrow('valid PNG');
  });
});

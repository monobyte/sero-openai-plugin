import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerOwnedTools } from '../tools';

vi.mock('../web-security', () => ({ readPublicPage: vi.fn(async (url: string) => ({ url, body: `<html><script>secret()</script><body>${'page '.repeat(6_000)}</body></html>` })) }));
vi.mock('../openai-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../openai-client')>();
  return { ...original, createImage: vi.fn(async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])) };
});

afterEach(() => vi.unstubAllGlobals());
function tools() {
  const registered: Array<{ name: string; execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text?: string }>; details: Record<string, unknown> }> }> = [];
  registerOwnedTools({ registerTool: (tool: unknown) => registered.push(tool as typeof registered[number]) } as never);
  return registered;
}
describe('owned tools', () => {
  it('registers search, page read, image, and fallback once', () => {
    expect(tools().map((tool) => tool.name)).toEqual(['openai_extender_web_search', 'openai_extender_read_page', 'openai_extender_describe_image', 'openai_extender_image']);
  });
  it('bounds page text and includes its source URL', async () => {
    const tool = tools().find((entry) => entry.name === 'openai_extender_read_page')!;
    const result = await tool.execute('id', { url: 'https://example.com/article' }, new AbortController().signal);
    expect(result.content[0].text).toContain('Source: https://example.com/article');
    expect(result.content[0].text).not.toContain('secret()');
    expect(result.details.truncated).toBe(true);
  });
  it('returns cancellation as a normal tool error', async () => {
    const { readPublicPage } = await import('../web-security');
    vi.mocked(readPublicPage).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    const tool = tools().find((entry) => entry.name === 'openai_extender_read_page')!;
    await expect(tool.execute('id', { url: 'https://example.com' }, new AbortController().signal)).rejects.toThrow('OpenAI operation was cancelled.');
  });
  it('writes a generated image through the normal preview result', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'oai-image-tool-'));
    const tool = tools().find((entry) => entry.name === 'openai_extender_image')!;
    const result = await tool.execute('id', { prompt: 'A green seedling' }, new AbortController().signal, undefined, { cwd });
    expect(result.details).toMatchObject({ preview: true });
    expect(result.content.some((entry) => entry.type === 'image')).toBe(true);
    await expect(readFile(result.details.path as string)).resolves.toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});

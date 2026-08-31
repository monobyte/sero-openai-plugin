import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImage, safeToolError, searchWeb, toToolError } from '../openai-client';

afterEach(() => vi.unstubAllGlobals());
const context = { model: { provider: 'openai', id: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' }, modelRegistry: { getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: 'secret', baseUrl: 'https://api.openai.com/v1' })) } } as never;
const oauthContext = {
  model: { provider: 'openai-codex', id: 'gpt-5.4', baseUrl: 'https://chatgpt.com/backend-api' },
  modelRegistry: {
    find: vi.fn(() => ({ provider: 'openai', id: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' })),
    getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: 'api-secret', baseUrl: 'https://api.openai.com/v1' })),
  },
};
describe('OpenAI client', () => {
  it('returns web source URLs and uses configured Pi authentication', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ output_text: 'answer', output: [{ content: [{ annotations: [{ url: 'https://example.com', title: 'Example' }] }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchWeb(context, 'query', new AbortController().signal)).resolves.toContain('https://example.com');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });
  it('uses the configured API-key route for tools on an OAuth model', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ output_text: 'answer', output: [{ content: [{ annotations: [{ url: 'https://example.com' }] }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await searchWeb(oauthContext as never, 'query', new AbortController().signal);
    expect(oauthContext.modelRegistry.find).toHaveBeenCalledWith('openai', 'gpt-4.1');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer api-secret' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('gpt-4.1');
  });
  it('does not expose provider payloads or credentials in errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('raw sk-secret payload', { status: 401 })));
    await expect(searchWeb(context, 'query', new AbortController().signal)).rejects.toThrow('OpenAI request failed (401)');
    expect(safeToolError(new Error('bad sk-secret'))).toBe('OpenAI operation failed.');
    expect(safeToolError(new Error('OpenAI failed with sk-secret'))).toBe('OpenAI failed with [redacted]');
  });
  it('rejects web search results that contain no source URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output_text: 'uncited answer' }), { status: 200 })));
    await expect(searchWeb(context, 'query', new AbortController().signal)).rejects.toThrow('no source URLs');
  });
  it('bounds streamed provider responses and throws a cancellation error', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) { for (let index = 0; index < 17; index += 1) controller.enqueue(chunk); controller.close(); } }))));
    await expect(searchWeb(context, 'query', new AbortController().signal)).rejects.toThrow('exceeds 16 MB');
    expect(() => { throw toToolError(new DOMException('secret cancellation detail', 'AbortError')); }).toThrow('OpenAI operation was cancelled.');
  });
  it('uses the generation and edit image routes', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createImage(context, 'seedling', new AbortController().signal)).resolves.toEqual(expect.any(Uint8Array));
    await expect(createImage(context, 'edit', new AbortController().signal, new Blob([new Uint8Array([1])], { type: 'image/png' }))).resolves.toEqual(expect.any(Uint8Array));
    expect(String(fetchMock.mock.calls[0][0])).toContain('/images/generations');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'gpt-image-1', prompt: 'seedling' });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/images/edits');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImage, describeImage, safeToolError, searchWeb, toToolError } from '../openai-client';

afterEach(() => vi.unstubAllGlobals());
const context = { model: { provider: 'openai', id: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' }, modelRegistry: { getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: 'secret', baseUrl: 'https://api.openai.com/v1' })) } } as never;
const oauthToken = `header.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' } })).toString('base64url')}.signature`;
const oauthContext = {
  model: { provider: 'openai-codex', id: 'gpt-5.6-luna', baseUrl: 'https://chatgpt.com/backend-api' },
  modelRegistry: {
    find: vi.fn(),
    getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: oauthToken, baseUrl: 'https://chatgpt.com/backend-api' })),
  },
};
describe('OpenAI client', () => {
  it('returns web source URLs and uses configured Pi authentication', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ output_text: 'answer', output: [{ content: [{ annotations: [{ url: 'https://example.com', title: 'Example' }] }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchWeb(context, 'query', new AbortController().signal)).resolves.toContain('https://example.com');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer secret');
  });
  it('uses the native Codex search route for tools on an OAuth model', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ output: 'answer', results: [{ url: 'https://example.com', title: 'Example' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await searchWeb(oauthContext as never, 'query', new AbortController().signal);
    expect(oauthContext.modelRegistry.find).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://chatgpt.com/backend-api/codex/alpha/search');
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${oauthToken}`);
    expect(headers.get('chatgpt-account-id')).toBe('account-1');
    expect(headers.get('originator')).toBe('codex_cli_rs');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ model: 'gpt-5.6-luna', commands: { search_query: [{ q: 'query' }] }, settings: { allowed_callers: ['direct'], external_web_access: true } });
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
  it('uses native Codex OAuth image generation and JSON edits', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await createImage(oauthContext as never, 'seedling', new AbortController().signal);
    await createImage(oauthContext as never, 'edit', new AbortController().signal, new Blob([new Uint8Array([1])], { type: 'image/png' }));
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://chatgpt.com/backend-api/codex/images/generations');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'gpt-image-2', prompt: 'seedling', background: 'auto', quality: 'auto', size: 'auto' });
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://chatgpt.com/backend-api/codex/images/edits');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ model: 'gpt-image-2', prompt: 'edit', images: [{ image_url: 'data:image/png;base64,AQ==' }] });
  });
  it('uses API-key authentication for image fallback during an OAuth session', async () => {
    const apiModel = { provider: 'openai', id: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' };
    const modelRegistry = {
      find: vi.fn(() => apiModel),
      getApiKeyAndHeaders: vi.fn(async (model) => model === apiModel
        ? { ok: true, apiKey: 'api-secret', baseUrl: apiModel.baseUrl }
        : { ok: true, apiKey: oauthToken, baseUrl: 'https://chatgpt.com/backend-api' }),
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ output_text: 'A cave painting.' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(describeImage({ ...oauthContext, modelRegistry } as never, Uint8Array.from([1]), 'image/png', new AbortController().signal)).resolves.toBe('A cave painting.');
    expect(modelRegistry.find).toHaveBeenCalledWith('openai', 'gpt-4.1');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer api-secret');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('gpt-4.1');
  });
  it('reports missing API-key authentication for OAuth image fallback', async () => {
    const modelRegistry = {
      find: vi.fn(() => ({ provider: 'openai', id: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' })),
      getApiKeyAndHeaders: vi.fn(async () => ({ ok: false })),
    };
    await expect(describeImage({ ...oauthContext, modelRegistry } as never, Uint8Array.from([1]), 'image/png', new AbortController().signal)).rejects.toThrow('OpenAI API-key authentication is not configured.');
  });
});

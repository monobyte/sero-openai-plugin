import { randomUUID } from 'node:crypto';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { codexEndpoint, extractAccountId } from './provider/routing';

interface OpenAIResponse { output_text?: string; output?: Array<{ content?: Array<{ text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }> }> }
interface ImageResponse { data?: Array<{ b64_json?: string }> }
interface CodexSearchResponse { output?: string; results?: Array<{ url?: string; title?: string }> }
interface CodexImageBody { model: string; prompt: string; background: string; quality: string; size: string; images?: Array<{ image_url: string }> }
interface RequestAuth { baseUrl: string; headers: HeadersInit; modelId: string; oauth: boolean }

function requestModel(ctx: ExtensionContext): Model<Api> | undefined {
  if (ctx.model?.provider === 'openai' || ctx.model?.provider === 'openai-codex') return ctx.model;
  return ctx.modelRegistry.find('openai', 'gpt-4.1');
}
async function requestAuth(ctx: ExtensionContext): Promise<RequestAuth> {
  const model = requestModel(ctx);
  if (!model) throw new Error('OpenAI API-key model configuration is not available.');
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) throw new Error(model.provider === 'openai-codex' ? 'OpenAI OAuth authentication is not configured.' : 'OpenAI API-key authentication is not configured.');
  if (model.provider !== 'openai-codex') {
    return { baseUrl: (auth.baseUrl ?? model.baseUrl).replace(/\/$/, ''), headers: { ...auth.headers, Authorization: `Bearer ${auth.apiKey}` }, modelId: model.id, oauth: false };
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(auth.headers ?? {})) if (value !== null) headers.set(name, value);
  headers.set('Authorization', `Bearer ${auth.apiKey}`);
  headers.set('chatgpt-account-id', extractAccountId(auth.apiKey));
  headers.set('originator', 'codex_cli_rs');
  headers.set('User-Agent', 'Sero-OpenAI-Extender/0.1');
  const baseUrl = codexEndpoint(auth.baseUrl ?? model.baseUrl).replace(/\/responses$/, '');
  return { baseUrl, headers, modelId: model.id, oauth: true };
}
async function openAIJson<T>(ctx: ExtensionContext, route: string, init: RequestInit, auth = requestAuth(ctx)): Promise<T> {
  const { baseUrl, headers } = await auth;
  const requestHeaders = new Headers(headers);
  new Headers(init.headers).forEach((value, name) => requestHeaders.set(name, value));
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers: requestHeaders, signal: init.signal ?? ctx.signal });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  if (!response.body) throw new Error('OpenAI returned an empty response.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('OpenAI response exceeds 16 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { throw new Error('OpenAI returned an invalid response.'); }
}
export async function searchWeb(ctx: ExtensionContext, query: string, signal: AbortSignal): Promise<string> {
  const auth = await requestAuth(ctx);
  if (auth.oauth) {
    const response = await openAIJson<CodexSearchResponse>(ctx, '/alpha/search', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), model: auth.modelId, commands: { search_query: [{ q: query }], response_length: 'medium' }, settings: { allowed_callers: ['direct'], external_web_access: true }, max_output_tokens: 2_500 }) }, Promise.resolve(auth));
    const sources = [...new Map((response.results ?? []).flatMap((item) => item.url ? [[item.url, item] as const] : [])).values()];
    if (sources.length === 0) throw new Error('OpenAI web search returned no source URLs.');
    return `${response.output ?? ''}\n\nSources:\n${sources.map((item) => `- ${item.title ?? item.url}: ${item.url}`).join('\n')}`.trim();
  }
  const response = await openAIJson<OpenAIResponse>(ctx, '/responses', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: auth.modelId, input: query, tools: [{ type: 'web_search_preview' }] }) }, Promise.resolve(auth));
  const annotations = response.output?.flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? []).filter((item) => item.url) ?? [];
  const sources = [...new Map(annotations.map((item) => [item.url, item])).values()];
  if (sources.length === 0) throw new Error('OpenAI web search returned no source URLs.');
  const answer = response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join('\n') ?? '';
  return `${answer}\n\nSources:\n${sources.map((item) => `- ${item.title ?? item.url}: ${item.url}`).join('\n')}`.trim();
}
export async function describeImage(ctx: ExtensionContext, bytes: Uint8Array, mimeType: string, signal: AbortSignal): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  const response = await openAIJson<OpenAIResponse>(ctx, '/responses', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4.1', input: [{ role: 'user', content: [{ type: 'input_text', text: 'Describe this image accurately and concisely.' }, { type: 'input_image', image_url: dataUrl }] }] }) });
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join('\n') ?? 'No image description was returned.';
}
export async function createImage(ctx: ExtensionContext, prompt: string, signal: AbortSignal, image?: Blob): Promise<Uint8Array> {
  const auth = await requestAuth(ctx);
  let response: ImageResponse;
  if (auth.oauth) {
    const body: CodexImageBody = { model: 'gpt-image-2', prompt, background: 'auto', quality: 'auto', size: 'auto' };
    if (image) body.images = [{ image_url: `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}` }];
    response = await openAIJson<ImageResponse>(ctx, image ? '/images/edits' : '/images/generations', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, Promise.resolve(auth));
  } else if (image) {
    const form = new FormData(); form.set('model', 'gpt-image-1'); form.set('prompt', prompt); form.set('image', image, 'input.png');
    response = await openAIJson<ImageResponse>(ctx, '/images/edits', { method: 'POST', signal, body: form }, Promise.resolve(auth));
  } else {
    response = await openAIJson<ImageResponse>(ctx, '/images/generations', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt }) }, Promise.resolve(auth));
  }
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error('OpenAI returned no image data.');
  return Uint8Array.from(Buffer.from(encoded, 'base64'));
}
export function safeToolError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'OpenAI operation was cancelled.';
  if (error instanceof Error && /^(OpenAI|Page|Only HTTP|Private and metadata|Image|Input image|Generated image)/.test(error.message)) return error.message.replace(/sk-[A-Za-z0-9_-]+/gi, '[redacted]');
  return 'OpenAI operation failed.';
}

export function toToolError(error: unknown): Error { return new Error(safeToolError(error)); }

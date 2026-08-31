import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

interface OpenAIResponse { output_text?: string; output?: Array<{ content?: Array<{ text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }> }> }
interface ImageResponse { data?: Array<{ b64_json?: string }> }

async function requestAuth(ctx: ExtensionContext): Promise<{ baseUrl: string; headers: HeadersInit }> {
  if (!ctx.model || ctx.model.provider !== 'openai') throw new Error('OpenAI tools require an active API-key OpenAI model.');
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) throw new Error('OpenAI API-key authentication is not configured.');
  return { baseUrl: (auth.baseUrl ?? ctx.model.baseUrl).replace(/\/$/, ''), headers: { ...auth.headers, Authorization: `Bearer ${auth.apiKey}` } };
}
async function openAIJson<T>(ctx: ExtensionContext, route: string, init: RequestInit): Promise<T> {
  const { baseUrl, headers } = await requestAuth(ctx);
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers: { ...headers, ...init.headers }, signal: init.signal ?? ctx.signal });
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
  const response = await openAIJson<OpenAIResponse>(ctx, '/responses', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ctx.model?.id, input: query, tools: [{ type: 'web_search_preview' }] }) });
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
  let response: ImageResponse;
  if (image) {
    const form = new FormData(); form.set('model', 'gpt-image-1'); form.set('prompt', prompt); form.set('image', image, 'input.png');
    response = await openAIJson<ImageResponse>(ctx, '/images/edits', { method: 'POST', signal, body: form });
  } else {
    response = await openAIJson<ImageResponse>(ctx, '/images/generations', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt }) });
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

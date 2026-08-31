import { createRequire } from 'node:module';
import type * as NodeZlib from 'node:zlib';
import { CodexEventError } from './events';
import type { CodexModel, CodexOptions, PreparedRequest } from './types';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
export const MAX_SSE_FRAME_BYTES = 8 * 1024 * 1024;
const require = createRequire(import.meta.url);
const zlib = require('node:zlib') as typeof NodeZlib;

function requestBody(body: PreparedRequest['body']): { body: BodyInit; encoding?: string } {
  const json = JSON.stringify(body);
  if (typeof zlib.zstdCompressSync !== 'function') return { body: json };
  const compressed = zlib.zstdCompressSync(json, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 3 } });
  return { body: new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength), encoding: 'zstd' };
}

function terminalQuota(text: string): boolean {
  return /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i.test(text);
}
function retryable(status: number, text: string): boolean {
  if (status === 429 && terminalQuota(text)) return false;
  return RETRYABLE_STATUS.has(status) || /rate.?limit|overloaded|service.?unavailable|upstream.?connect|connection.?refused/i.test(text);
}
function responseError(text: string, status: number): CodexEventError {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const error = (parsed as { error?: unknown }).error;
      if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
        const value = error as { code?: unknown; type?: unknown; message?: unknown };
        const code = typeof value.code === 'string' ? value.code : typeof value.type === 'string' ? value.type : undefined;
        return new CodexEventError(code, value.message);
      }
    }
  } catch { /* non-JSON errors use only recognized operational text */ }
  const message = /context|token|prompt|request_too_large|usage limit|rate limit/i.test(text) ? text : undefined;
  return new CodexEventError(undefined, message ?? `OpenAI Codex request failed (${status}).`);
}
function requestedDelay(response: Response): number | undefined {
  const milliseconds = response.headers.get('retry-after-ms');
  if (milliseconds !== null) { const value = Number(milliseconds); if (Number.isFinite(value)) return Math.max(0, value); }
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter); if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(retryAfter); return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
function boundedDelay(delay: number, maximum: number): number {
  if (maximum > 0 && delay > maximum) throw new Error(`Provider retry delay exceeds ${Math.ceil(maximum / 1000)} seconds.`);
  return delay;
}
function wait(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Request was aborted')); return; }
    const abort = () => { clearTimeout(timer); reject(new Error('Request was aborted')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delay);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function timeoutMs(options?: CodexOptions): number | undefined {
  const value = options?.timeoutMs; if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid timeoutMs: ${String(value)}`);
  return Math.floor(value);
}
async function fetchWithTimeout(prepared: PreparedRequest, fetcher: typeof fetch, options?: CodexOptions): Promise<Response> {
  const timeout = timeoutMs(options); const controller = new AbortController();
  const abort = () => controller.abort(); options?.signal?.addEventListener('abort', abort, { once: true });
  const timer = timeout && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;
  try {
    const payload = requestBody(prepared.body); const headers = new Headers(prepared.headers);
    if (payload.encoding) headers.set('content-encoding', payload.encoding); else headers.delete('content-encoding');
    const response = await fetcher(prepared.endpoint, { method: 'POST', headers, body: payload.body, signal: controller.signal });
    return response;
  } catch (error) {
    if (timer && controller.signal.aborted && !options?.signal?.aborted) throw new Error(`OpenAI Codex SSE response headers timed out after ${timeout}ms`);
    if (options?.signal?.aborted) throw new Error('Request was aborted');
    throw error;
  } finally { if (timer) clearTimeout(timer); options?.signal?.removeEventListener('abort', abort); }
}

export async function openSse(prepared: PreparedRequest, model: CodexModel, options?: CodexOptions): Promise<Response> {
  const fetcher = options?.fetch ?? globalThis.fetch; const retries = options?.maxRetries ?? 0; const maximum = options?.maxRetryDelayMs ?? 60_000;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options?.signal?.aborted) throw new Error('Request was aborted');
    let response: Response;
    try { response = await fetchWithTimeout(prepared, fetcher, options); }
    catch (error) {
      if (attempt < retries && !options?.signal?.aborted) { await wait(boundedDelay(1000 * 2 ** attempt, maximum), options?.signal); continue; }
      throw error;
    }
    const responseHeaders: Record<string, string> = {}; response.headers.forEach((value, name) => { responseHeaders[name] = value; });
    try { await options?.onResponse?.({ status: response.status, headers: responseHeaders }, model); }
    catch (error) { await response.body?.cancel().catch(() => undefined); throw error; }
    if (response.ok) return response;
    const errorText = await response.text();
    if (attempt < retries && retryable(response.status, errorText)) {
      await response.body?.cancel().catch(() => undefined);
      await wait(boundedDelay(requestedDelay(response) ?? 1000 * 2 ** attempt, maximum), options?.signal); continue;
    }
    await response.body?.cancel().catch(() => undefined); throw responseError(errorText, response.status);
  }
  throw new Error('OpenAI Codex request failed.');
}

async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeout: number | undefined): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!timeout || timeout <= 0) return reader.read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`OpenAI Codex SSE body timed out after ${timeout}ms`)), timeout); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
export async function* parseSse(response: Response, signal?: AbortSignal, timeout?: number): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new Error('OpenAI Codex returned an empty response.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  const abort = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('Request was aborted');
    while (true) {
      if (signal?.aborted) throw new Error('Request was aborted');
      const chunk = await readWithTimeout(reader, timeout); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/); if (boundary < 0) break;
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + (buffer.startsWith('\r\n', boundary) ? 4 : 2));
        if (new TextEncoder().encode(frame).byteLength > MAX_SSE_FRAME_BYTES) throw new Error('OpenAI Codex SSE frame exceeded the size limit.');
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (data && data !== '[DONE]') { const value: unknown = JSON.parse(data); if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('OpenAI Codex returned a malformed event.'); yield value as Record<string, unknown>; }
      }
      if (new TextEncoder().encode(buffer).byteLength > MAX_SSE_FRAME_BYTES) throw new Error('OpenAI Codex SSE frame exceeded the size limit.');
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(); } catch { /* reader may already be cancelled */ }
    try { reader.releaseLock(); } catch { /* reader may already be released */ }
  }
}

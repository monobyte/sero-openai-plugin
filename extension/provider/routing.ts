import { randomUUID } from 'node:crypto';
import type { CodexModel, CodexOptions, CodexRequestBody, PreparedRequest, ServiceTier } from './types';

const CLAIM = 'https://api.openai.com/auth';
export function extractAccountId(token: string): string {
  const part = token.split('.')[1];
  if (!part) throw new Error('OAuth credential is invalid.');
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { throw new Error('OAuth credential is invalid.'); }
  if (typeof parsed !== 'object' || parsed === null || !(CLAIM in parsed)) throw new Error('OAuth credential has no account.');
  const auth = parsed[CLAIM as keyof typeof parsed];
  if (typeof auth !== 'object' || auth === null || !('chatgpt_account_id' in auth) || typeof auth.chatgpt_account_id !== 'string') throw new Error('OAuth credential has no account.');
  const accountId = auth.chatgpt_account_id.trim();
  if (!accountId || accountId.length > 256 || /[\s\u0000-\u001f\u007f]/.test(accountId)) throw new Error('OAuth credential has no account.');
  return accountId;
}
export function codexEndpoint(baseUrl: string): string { const base = baseUrl.replace(/\/+$/, ''); return base.endsWith('/codex/responses') ? base : base.endsWith('/codex') ? `${base}/responses` : `${base}/codex/responses`; }
export function prepareRouting(model: CodexModel, body: CodexRequestBody, options: CodexOptions | undefined): PreparedRequest {
  if (!options?.apiKey) throw new Error('OpenAI OAuth authentication is not configured.');
  const accountId = extractAccountId(options.apiKey); const sessionId = options.cacheRetention === 'none' ? undefined : options.sessionId;
  const routedModelId = body.model;
  const requestId = sessionId || randomUUID(); const priority = body.service_tier === 'priority';
  const headers = new Headers(model.headers);
  for (const [name, value] of Object.entries(options.headers ?? {})) value === null ? headers.delete(name) : headers.set(name, value);
  headers.set('Authorization', `Bearer ${options.apiKey}`); headers.set('chatgpt-account-id', accountId);
  headers.set('originator', priority ? 'codex_cli_rs' : 'pi'); headers.set('User-Agent', 'Sero-OpenAI-Extender/0.1');
  headers.set('OpenAI-Beta', 'responses=experimental'); headers.set('accept', 'text/event-stream'); headers.set('content-type', 'application/json');
  headers.set('x-client-request-id', requestId); headers.set('x-request-id', requestId); if (sessionId) headers.set('session-id', sessionId);
  if (priority) headers.set('x-codex-routing-hint', `model=${routedModelId};tier=priority`); else headers.delete('x-codex-routing-hint');
  const endpoint = codexEndpoint(model.baseUrl); const routeKey = `${accountId}|${sessionId ?? requestId}|${endpoint}|${routedModelId}|${priority ? 'priority' : 'default'}`;
  const requestedTier = ['auto', 'priority', 'default', 'flex', 'scale'].includes(String(body.service_tier)) ? body.service_tier as ServiceTier : undefined;
  return { body, accountId, sessionId, requestId, routeKey, headers, endpoint, requestedTier, routedModelId };
}
export function websocketHeaders(prepared: PreparedRequest): Headers { const headers = new Headers(prepared.headers); headers.delete('accept'); headers.delete('content-type'); headers.set('OpenAI-Beta', 'responses_websockets=2026-02-06'); return headers; }
